const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const roomsFilePath = path.join(__dirname, '/rooms.json');

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
    clients.add(ws);
    
    ws.on('close', () => {
        clients.delete(ws);
    });
});

// Function to broadcast updates to all connected clients
function broadcastUpdate(type, data) {
    const message = JSON.stringify({ type, data });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

app.get('/rooms', (req, res) => {
    fs.readFile(roomsFilePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error reading rooms file');
            return;
        }
        res.send(JSON.parse(data));
    });
});

app.post('/rooms', (req, res) => {
    fs.writeFile(roomsFilePath, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) {
            res.status(500).send('Error writing rooms file');
            return;
        }
        
        // Broadcast the update to all connected clients
        broadcastUpdate('roomsUpdated', req.body);
        
        res.send('Rooms updated successfully');
    });
});

// Initialize rooms.json if it doesn't exist
if (!fs.existsSync(roomsFilePath)) {
    fs.writeFileSync(roomsFilePath, JSON.stringify({}, null, 2), 'utf8');
}

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`WebSocket server is running on ws://localhost:${PORT}`);
});