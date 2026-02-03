const express = require('express');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const port = 18796;

app.use(express.static(__dirname));

// API: Get Agent Status
app.get('/api/status', (req, res) => {
    // In a real integration, this would query the Clawdbot API.
    // For now, we'll mock the live connection or read from a status file if I write one.
    
    // Attempt to get system stats via CLI (simplified)
    const status = {
        name: "Victoria",
        online: true,
        model: "google/gemini-3-pro-preview",
        mode: "Direct / High Performance",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        tasks: [
            { id: 1, name: "ReplayBrick Conflict Engine", status: "Pending" },
            { id: 2, name: "Cruise App UI", status: "Building" }
        ],
        system: {
            host: "Hoth",
            platform: process.platform,
            node: process.version
        }
    };
    res.json(status);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'victoria-dashboard.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Victoria's Dashboard listening at http://0.0.0.0:${port}`);
});
