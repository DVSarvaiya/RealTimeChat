const MAX_ROOMS = 10;
const ADMIN_PASSWORD = "123"; // Example admin password
let isAdmin = false; // Flag to check if admin is logged in
let currentRoomId = null; // Track the current room ID
let userScrolled = false; // Flag to check if user has scrolled
let socket; // WebSocket connection
let nickname = ""; // User nickname
let roomTimers = {}; // Object to store room timer intervals
let isDarkMode = localStorage.getItem('darkMode') === 'true';

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log('WebSocket connection established');
        showNotification('Connected to server', 'success');
    };
    
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'roomsUpdated') {
                handleRoomsUpdate(data.data);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };
    
    socket.onclose = () => {
        console.log('WebSocket connection closed. Attempting to reconnect...');
        showNotification('Connection lost. Reconnecting...', 'warning');
        setTimeout(initWebSocket, 3000);
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        showNotification('Connection error', 'error');
    };
}

// Handle room updates from WebSocket
function handleRoomsUpdate(rooms) {
    updateRoomsList(rooms);
    
    if (currentRoomId && rooms[currentRoomId]) {
        updateMessages(currentRoomId, rooms[currentRoomId].messages);
    }
}

// Format time from milliseconds to MM:SS format
function formatTimeRemaining(milliseconds) {
    if (milliseconds <= 0) return "00:00";
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Update the rooms list UI with time remaining
function updateRoomsList(rooms) {
    const roomsList = document.getElementById("rooms-list");
    
    // Save the current scroll position
    const scrollPos = roomsList.scrollTop;
    
    roomsList.innerHTML = "";

    for (let roomId in rooms) {
        const timeRemaining = rooms[roomId].expiryTime - Date.now();
        
        if (timeRemaining <= 0) {
            deleteRoom(roomId);
            continue;
        }
        
        const li = document.createElement("li");
        li.className = "animated-entry";
        
        const roomInfoDiv = document.createElement("div");
        roomInfoDiv.className = "room-info";
        
        const titleSpan = document.createElement("span");
        titleSpan.className = "room-title";
        titleSpan.textContent = rooms[roomId].title;
        titleSpan.setAttribute('title', rooms[roomId].title); // Add tooltip for long names
        
        const timeSpan = document.createElement("span");
        timeSpan.className = "room-time";
        timeSpan.id = `timer-${roomId}`;
        timeSpan.textContent = formatTimeRemaining(timeRemaining);
        
        const usersSpan = document.createElement("span");
        usersSpan.className = "room-users";
        usersSpan.textContent = `${(rooms[roomId].messages || []).length} messages`;
        
        roomInfoDiv.appendChild(titleSpan);
        roomInfoDiv.appendChild(timeSpan);
        roomInfoDiv.appendChild(usersSpan);
        
        li.appendChild(roomInfoDiv);
        li.onclick = () => enterRoom(roomId);
        
        if (isAdmin) {
            const deleteButton = document.createElement("button");
            deleteButton.id = "delete-button";
            deleteButton.textContent = "Delete";
            deleteButton.setAttribute('aria-label', 'Delete room');
            deleteButton.onclick = (event) => {
                event.stopPropagation();
                if (confirm(`Are you sure you want to delete "${rooms[roomId].title}"?`)) {
                    deleteRoom(roomId);
                    hideRoom(roomId);
                }
            };
            li.appendChild(deleteButton);
        }
        
        roomsList.appendChild(li);
        
        // Start or update timer for this room
        updateRoomTimer(roomId, timeRemaining);
    }
    
    // Restore scroll position
    roomsList.scrollTop = scrollPos;
}

// Start or update timer for a specific room
function updateRoomTimer(roomId, initialTimeRemaining) {
    // Clear existing timer if any
    if (roomTimers[roomId]) {
        clearInterval(roomTimers[roomId]);
    }
    
    // Set new timer
    roomTimers[roomId] = setInterval(() => {
        const timerElement = document.getElementById(`timer-${roomId}`);
        if (!timerElement) {
            clearInterval(roomTimers[roomId]);
            return;
        }
        
        const currentTime = Date.now();
        const timeRemaining = Math.max(0, initialTimeRemaining - (currentTime - (new Date()).getTime()));
        timerElement.textContent = formatTimeRemaining(timeRemaining);
        
        // Update countdown in chat room if open
        const roomTimerDisplay = document.getElementById(`room-timer-${roomId}`);
        if (roomTimerDisplay) {
            roomTimerDisplay.textContent = formatTimeRemaining(timeRemaining);
            
            // Add visual feedback for time running out
            if (timeRemaining < 60000) { // less than 1 minute
                roomTimerDisplay.classList.add("time-critical");
                if (timeRemaining % 10000 < 500) {
                    showNotification("Room expiring soon!", "warning", 1000);
                }
            } else if (timeRemaining < 300000) { // less than 5 minutes
                roomTimerDisplay.classList.add("time-warning");
                roomTimerDisplay.classList.remove("time-critical");
            }
        }
        
        if (timeRemaining <= 0) {
            clearInterval(roomTimers[roomId]);
            loadRooms(); // Refresh room list to remove expired room
            
            if (currentRoomId === roomId) {
                hideRoom(roomId);
                showNotification("This room has expired", "warning");
            }
        }
    }, 1000);
}

// Update messages for a specific room
function updateMessages(roomId, messages) {
    const messagesDiv = document.getElementById(`messages-${roomId}`);
    if (!messagesDiv) return;
    
    // Check if we need to add new messages
    const currentMessageCount = messagesDiv.children.length;
    
    if (messages.length > currentMessageCount) {
        // Add only the new messages
        for (let i = currentMessageCount; i < messages.length; i++) {
            displayMessage(roomId, messages[i]);
        }
        
        if (!userScrolled) {
            scrollToBottom(roomId);
        } else {
            // Show new message indicator
            showNewMessageIndicator(roomId);
        }
    }
}

// Show new message indicator when user has scrolled up
function showNewMessageIndicator(roomId) {
    let indicator = document.getElementById(`new-message-indicator-${roomId}`);
    
    if (!indicator) {
        indicator = document.createElement("div");
        indicator.id = `new-message-indicator-${roomId}`;
        indicator.className = "new-message-indicator";
        indicator.textContent = "New messages ↓";
        indicator.onclick = () => {
            scrollToBottom(roomId);
            indicator.style.display = "none";
        };
        
        const chatBox = document.getElementById(`chat-${roomId}`);
        if (chatBox) {
            chatBox.appendChild(indicator);
        }
    }
    
    indicator.style.display = "flex";
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (indicator) {
            indicator.style.display = "none";
        }
    }, 5000);
}

async function fetchRooms() {
    try {
        const response = await fetch('/rooms');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching rooms:', error);
        showNotification('Error loading rooms', 'error');
        return {};
    }
}

async function saveRooms(rooms) {
    try {
        const response = await fetch('/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rooms)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error saving rooms:', error);
        showNotification('Error saving data', 'error');
        return false;
    }
}

function showNotification(message, type = 'success', duration = 4000) {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.alert-notification');
    existingNotifications.forEach(notification => {
        notification.remove();
    });
    
    // Create new notification
    const notification = document.createElement('div');
    notification.className = `alert-notification ${type}`;
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    
    const closeButton = document.createElement('button');
    closeButton.className = 'close-btn';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => notification.remove();
    
    notification.appendChild(messageSpan);
    notification.appendChild(closeButton);
    
    document.body.appendChild(notification);
    
    // Auto-dismiss after duration
    setTimeout(() => {
        if (notification && notification.parentNode) {
            notification.remove();
        }
    }, duration);
}

async function loadRooms() {
    const rooms = await fetchRooms();
    updateRoomsList(rooms);
}

async function createRoom() {
    const titleInput = document.getElementById('room-title');
    const passwordInput = document.getElementById('room-password');
    const timeInput = document.getElementById('room-time');
    
    const title = titleInput.value.trim();
    const password = passwordInput.value.trim();
    const timeLimit = parseInt(timeInput.value);
    
    if (!title) {
        showNotification('Please enter a room title', 'warning');
        return;
    }
    
    if (!password) {
        showNotification('Please set a room password', 'warning');
        return;
    }
    
    if (isNaN(timeLimit) || timeLimit <= 0) {
        showNotification('Please enter a valid time limit', 'warning');
        return;
    }
    
    // Get existing rooms
    const rooms = await fetchRooms();
    
    // Check if max rooms limit reached
    if (Object.keys(rooms).length >= MAX_ROOMS && !isAdmin) {
        showNotification(`Maximum number of rooms (${MAX_ROOMS}) reached. Wait for some to expire or contact admin.`, 'error');
        return;
    }
    
    // Generate unique room ID
    const roomId = 'room_' + Date.now();
    
    // Create room object
    rooms[roomId] = {
        title: title,
        password: password,
        expiryTime: Date.now() + (timeLimit * 60 * 1000), // Convert minutes to milliseconds
        messages: []
    };
    
    // Save rooms
    const success = await saveRooms(rooms);
    
    if (success) {
        // Clear inputs
        titleInput.value = '';
        passwordInput.value = '';
        timeInput.value = '';
        
        showNotification('Room created successfully', 'success');
        updateRoomsList(rooms);
    }
}

async function enterRoom(roomId) {
    // Get current rooms
    const rooms = await fetchRooms();
    
    if (!rooms[roomId]) {
        showNotification('Room not found or expired', 'error');
        return;
    }
    
    // Ask for password if not admin
    if (!isAdmin) {
        const enteredPassword = prompt(`Enter password for room "${rooms[roomId].title}"`);
        
        if (!enteredPassword) return; // Cancelled
        
        if (enteredPassword !== rooms[roomId].password) {
            showNotification('Incorrect password', 'error');
            return;
        }
    }
    
    // Ask for nickname if not set
    if (!nickname) {
        const enteredNickname = prompt('Enter your nickname for the chat');
        
        if (!enteredNickname || enteredNickname.trim() === '') {
            showNotification('Nickname is required', 'warning');
            return;
        }
        
        nickname = enteredNickname.trim();
    }
    
    // Update current room ID
    currentRoomId = roomId;
    
    // Create or show chat box
    createChatBox(roomId, rooms[roomId]);
    showNotification(`Joined room: ${rooms[roomId].title}`, 'success');
}

function createChatBox(roomId, roomData) {
    // Hide any existing chat boxes
    const existingChatBoxes = document.querySelectorAll('.chat-box');
    existingChatBoxes.forEach(box => {
        box.style.display = 'none';
    });
    
    // Look for existing chat box for this room
    let chatBox = document.getElementById(`chat-${roomId}`);
    
    if (!chatBox) {
        // Create new chat box if it doesn't exist
        chatBox = document.createElement('div');
        chatBox.id = `chat-${roomId}`;
        chatBox.className = 'chat-box';
        
        // Create chat header
        const header = document.createElement('div');
        header.className = 'chat-header';
        
        const title = document.createElement('h2');
        title.textContent = roomData.title;
        
        const controls = document.createElement('div');
        controls.className = 'chat-controls';
        
        const timerContainer = document.createElement('div');
        timerContainer.className = 'timer-container';
        
        const timerIcon = document.createElement('span');
        timerIcon.className = 'timer-icon';
        timerIcon.innerHTML = '&#128337;'; // Clock emoji
        
        const timer = document.createElement('span');
        timer.id = `room-timer-${roomId}`;
        timer.textContent = formatTimeRemaining(roomData.expiryTime - Date.now());
        
        timerContainer.appendChild(timerIcon);
        timerContainer.appendChild(timer);
        
        const userButton = document.createElement('button');
        userButton.className = 'user-button';
        
        const userIcon = document.createElement('span');
        userIcon.className = 'user-icon';
        userIcon.innerHTML = '&#128100;'; // User emoji
        
        const userName = document.createElement('span');
        userName.textContent = nickname;
        userName.onclick = () => {
            const newNickname = prompt('Change your nickname:', nickname);
            if (newNickname && newNickname.trim() !== '') {
                nickname = newNickname.trim();
                userName.textContent = nickname;
                showNotification('Nickname updated', 'success');
            }
        };
        
        userButton.appendChild(userIcon);
        userButton.appendChild(userName);
        
        controls.appendChild(timerContainer);
        controls.appendChild(userButton);
        
        header.appendChild(title);
        header.appendChild(controls);
        
        // Create messages area
        const messagesContainer = document.createElement('div');
        messagesContainer.className = 'messages';
        messagesContainer.id = `messages-${roomId}`;
        
        // Handle scroll event to track if user has scrolled up
        messagesContainer.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
            userScrolled = scrollTop < scrollHeight - clientHeight - 10;
            
            // Hide new message indicator if scrolled to bottom
            if (!userScrolled) {
                const indicator = document.getElementById(`new-message-indicator-${roomId}`);
                if (indicator) {
                    indicator.style.display = 'none';
                }
            }
        });
        
        // Create message input area
        const inputContainer = document.createElement('div');
        inputContainer.className = 'message-input-container';
        
        const messageInput = document.createElement('input');
        messageInput.type = 'text';
        messageInput.className = 'message-input';
        messageInput.id = `message-input-${roomId}`;
        messageInput.placeholder = 'Type your message...';
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage(roomId);
            }
        });
        
        const sendButton = document.createElement('button');
        sendButton.className = 'send-button';
        sendButton.innerHTML = '&#10148;'; // Right arrow emoji
        sendButton.setAttribute('aria-label', 'Send message');
        sendButton.onclick = () => sendMessage(roomId);
        
        inputContainer.appendChild(messageInput);
        inputContainer.appendChild(sendButton);
        
        // Assemble chat box
        chatBox.appendChild(header);
        chatBox.appendChild(messagesContainer);
        chatBox.appendChild(inputContainer);
        
        // Add to document
        document.getElementById('chat-container').appendChild(chatBox);
        
        // Display existing messages
        if (roomData.messages && roomData.messages.length > 0) {
            roomData.messages.forEach(message => {
                displayMessage(roomId, message);
            });
            
            // Scroll to bottom
            scrollToBottom(roomId);
        }
    }
    
    // Show chat box
    chatBox.style.display = 'block';
    
    // Focus input field
    setTimeout(() => {
        const input = document.getElementById(`message-input-${roomId}`);
        if (input) {
            input.focus();
        }
    }, 100);
}

async function sendMessage(roomId) {
    const messageInput = document.getElementById(`message-input-${roomId}`);
    const messageText = messageInput.value.trim();
    
    if (!messageText) return;
    
    // Get rooms
    const rooms = await fetchRooms();
    
    if (!rooms[roomId]) {
        showNotification('Room not found or expired', 'error');
        return;
    }
    
    // Create message object
    const message = {
        sender: nickname,
        text: messageText,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        timestamp: Date.now()
    };
    
    // Add message to room
    if (!rooms[roomId].messages) {
        rooms[roomId].messages = [];
    }
    
    rooms[roomId].messages.push(message);
    
    // Save rooms
    const success = await saveRooms(rooms);
    
    if (success) {
        // Clear input
        messageInput.value = '';
        messageInput.focus();
        
        // Display message
        displayMessage(roomId, message);
        
        // Scroll to bottom
        scrollToBottom(roomId);
    }
}

function displayMessage(roomId, message) {
    const messagesContainer = document.getElementById(`messages-${roomId}`);
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.sender === nickname ? 'own-message' : ''}`;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    
    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender';
    senderSpan.textContent = message.sender;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = message.time;
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = message.text;
    
    headerDiv.appendChild(senderSpan);
    headerDiv.appendChild(timeSpan);
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(textDiv);
    
    messagesContainer.appendChild(messageDiv);
}

function scrollToBottom(roomId) {
    const messagesContainer = document.getElementById(`messages-${roomId}`);
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        userScrolled = false;
    }
}

function hideRoom(roomId) {
    const chatBox = document.getElementById(`chat-${roomId}`);
    if (chatBox) {
        chatBox.style.display = 'none';
    }
    
    // Also clear any timers for this room
    if (roomTimers[roomId]) {
        clearInterval(roomTimers[roomId]);
        delete roomTimers[roomId];
    }
    
    // Clear current room ID if this was the active room
    if (currentRoomId === roomId) {
        currentRoomId = null;
    }
}

async function deleteRoom(roomId) {
    // Get rooms
    const rooms = await fetchRooms();
    
    // Delete room if it exists
    if (rooms[roomId]) {
        delete rooms[roomId];
        
        // Save updated rooms
        await saveRooms(rooms);
        
        // Update rooms list
        updateRoomsList(rooms);
        
        // Hide room UI if open
        hideRoom(roomId);
        
        showNotification('Room deleted', 'success');
    }
}

function showAdminLogin() {
    const adminLogin = document.getElementById('admin-login');
    adminLogin.style.display = adminLogin.style.display === 'block' ? 'none' : 'block';
    
    // Focus password field
    if (adminLogin.style.display === 'block') {
        document.getElementById('admin-password').focus();
        // Clear any previous value
        document.getElementById('admin-password').value = '';
    }
}

function adminLogin() {
    const password = document.getElementById('admin-password').value;
    
    if (password === ADMIN_PASSWORD) {
        isAdmin = true;
        
        // Update UI
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-login-button').style.display = 'none';
        document.getElementById('admin-logout-button').style.display = 'block';
        
        // Refresh rooms list to show delete buttons
        loadRooms();
        
        showNotification('Admin mode activated', 'success');
    } else {
        showNotification('Incorrect admin password', 'error');
    }
}

function adminLogout() {
    isAdmin = false;
    
    // Update UI
    document.getElementById('admin-logout-button').style.display = 'none';
    document.getElementById('admin-login-button').style.display = 'block';
    
    // Refresh rooms list to hide delete buttons
    loadRooms();
    
    showNotification('Admin logged out', 'success');
}

// Toggle dark mode
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    
    // Save preference
    localStorage.setItem('darkMode', isDarkMode);
    
    // Update UI
    document.body.classList.toggle('dark-mode', isDarkMode);
    
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.innerHTML = isDarkMode ? '&#9788;' : '&#9789;'; // Sun : Moon
    }
}

// Initialize dark mode based on saved preference
function initDarkMode() {
    const darkModeToggle = document.createElement('div');
    darkModeToggle.className = 'dark-mode-toggle';
    darkModeToggle.innerHTML = isDarkMode ? '&#9788;' : '&#9789;'; // Sun : Moon
    darkModeToggle.setAttribute('aria-label', 'Toggle dark mode');
    darkModeToggle.onclick = toggleDarkMode;
    
    document.body.appendChild(darkModeToggle);
    
    // Apply dark mode if enabled
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
    }
}

// Initialize the application
window.onload = () => {
    loadRooms();
    initWebSocket();
    initDarkMode();
    
    // Add event listeners to admin password input
    const adminPasswordInput = document.getElementById('admin-password');
    if (adminPasswordInput) {
        adminPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                adminLogin();
            }
        });
    }
    
    // Add floating action button for mobile
    const fab = document.createElement('div');
    fab.className = 'mobile-fab';
    fab.innerHTML = '+';
    fab.onclick = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };
    document.body.appendChild(fab);
};
