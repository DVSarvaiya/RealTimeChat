const MAX_ROOMS = 10;
const ADMIN_PASSWORD = "123"; // Example admin password
let isAdmin = false; // Flag to check if admin is logged in
let currentRoomId = null; // Track the current room ID
let userScrolled = false; // Flag to check if user has scrolled

async function fetchRooms() {
    const response = await fetch('/rooms');
    const data = await response.json();
    return data;
}

async function saveRooms(rooms) {
    await fetch('/rooms', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(rooms)
    });
}

async function createRoom() {
    const title = document.getElementById("room-title").value;
    const password = document.getElementById("room-password").value;
    const timeLimit = document.getElementById("room-time").value;

    let rooms = await fetchRooms();

    if (Object.keys(rooms).length >= MAX_ROOMS) {
        alert("Maximum 10 rooms allowed!");
        return;
    }

    if (!title || !password || !timeLimit) {
        alert("All fields are required!");
        return;
    }

    for (let roomId in rooms) {
        if (rooms[roomId].title === title) {
            alert("Room title already exists!");
            return;
        }
    }

    const roomId = `room_${Date.now()}`;
    const expiryTime = Date.now() + timeLimit * 60 * 1000;

    rooms[roomId] = {
        title,
        password,
        expiryTime,
        messages: [],
    };

    setTimeout(() => {
        deleteRoom(roomId);
    }, timeLimit * 60 * 1000);

    await saveRooms(rooms);
    loadRooms();
}

async function loadRooms() {
    const rooms = await fetchRooms();
    const roomsList = document.getElementById("rooms-list");
    roomsList.innerHTML = "";

    for (let roomId in rooms) {
        const li = document.createElement("li");
        li.textContent = rooms[roomId].title;
        li.onclick = () => enterRoom(roomId);
        if (isAdmin) {
            const deleteButton = document.createElement("button");
            deleteButton.textContent = "Delete";
            deleteButton.onclick = (event) => {
                event.stopPropagation();
                deleteRoom(roomId);
            };
            li.appendChild(deleteButton);
        }
        roomsList.appendChild(li);
    }
}

async function enterRoom(roomId) {
    const rooms = await fetchRooms();
    const password = prompt("Enter room password:");
    if (password !== rooms[roomId].password) {
        alert("Incorrect password!");
        return;
    }

    currentRoomId = roomId;

    let chatBox = document.getElementById(`chat-${roomId}`);
    if (!chatBox) {
        chatBox = document.createElement("div");
        chatBox.classList.add("chat-box");
        chatBox.id = `chat-${roomId}`;
        chatBox.innerHTML = `
            <h2>${rooms[roomId].title}</h2>
            <button onclick="hideRoom('${roomId}')">Hide</button>
            <div class="messages" id="messages-${roomId}" onscroll="handleScroll('${roomId}')"></div>
            <input type="text" class="message-input" id="message-${roomId}" placeholder="Type a message" onkeypress="handleKeyPress(event, '${roomId}')">
            <button onclick="sendMessage('${roomId}')">Send</button>
        `;
        document.getElementById("chat-container").appendChild(chatBox);
    }

    chatBox.style.display = "block";
    loadMessages(roomId);
}

async function sendMessage(roomId) {
    const rooms = await fetchRooms();
    const messageInput = document.getElementById(`message-${roomId}`);
    const message = messageInput.value;
    if (!message) return;

    rooms[roomId].messages.push(message);
    await saveRooms(rooms);
    displayMessage(roomId, message);
    messageInput.value = "";
    messageInput.focus();
    scrollToBottom(roomId);
}

async function loadMessages(roomId) {
    const rooms = await fetchRooms();
    const messagesDiv = document.getElementById(`messages-${roomId}`);
    messagesDiv.innerHTML = "";
    rooms[roomId].messages.forEach(msg => displayMessage(roomId, msg));
    if (!userScrolled) {
        scrollToBottom(roomId);
    }
}

function displayMessage(roomId, message) {
    const messagesDiv = document.getElementById(`messages-${roomId}`);
    const msgDiv = document.createElement("div");
    msgDiv.textContent = message;
    msgDiv.classList.add("message");
    messagesDiv.appendChild(msgDiv);
}

function scrollToBottom(roomId) {
    const messagesDiv = document.getElementById(`messages-${roomId}`);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function handleScroll(roomId) {
    const messagesDiv = document.getElementById(`messages-${roomId}`);
    userScrolled = messagesDiv.scrollTop + messagesDiv.clientHeight < messagesDiv.scrollHeight - 1;
}

async function deleteRoom(roomId) {
    let rooms = await fetchRooms();
    delete rooms[roomId];
    await saveRooms(rooms);
    document.getElementById(`chat-${roomId}`)?.remove();
    loadRooms();
}

function hideRoom(roomId) {
    const chatBox = document.getElementById(`chat-${roomId}`);
    if (chatBox) {
        chatBox.style.display = "none";
    }
}
let c = 0;
function showAdminLogin() {
    if(c === 0){
        document.getElementById("admin-login").style.display = "block";
        c = 1;
        document.getElementById("admin-password").focus();
    }
    else{
        document.getElementById("admin-login").style.display = "none";
        c = 0;
    }
}

function adminLogin() {
    const password = document.getElementById("admin-password").value;
    if (password === ADMIN_PASSWORD) {
        isAdmin = true;
        document.getElementById("admin-login").style.display = "none";
        document.getElementById("admin-login-button").style.display = "none";
        document.getElementById("admin-logout-button").style.display = "inline";
        loadRooms();
    } else {
        alert("Incorrect admin password!");
    }
    document.getElementById("admin-password").value = "";
    document.getElementById("admin-password").focus();
}

function adminLogout() {
    isAdmin = false;
    document.getElementById("admin-login-button").style.display = "inline";
    document.getElementById("admin-logout-button").style.display = "none";
    loadRooms();
}

function handleKeyPress(event, roomId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage(roomId);
    }
}

async function pollForUpdates() {
    const rooms = await fetchRooms();
    loadRooms();
    if (currentRoomId) {
        loadMessages(currentRoomId);
    }
    setTimeout(pollForUpdates, 1000); // Poll every 1 second
}

window.onload = () => {
    loadRooms();
    pollForUpdates();
};
