const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const roomsFilePath = path.join(__dirname, '/rooms.json');

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
        res.send('Rooms updated successfully');
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});