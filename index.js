/*
  Updated version:
  - Uses process.env.PORT for cloud deployment.
  - Replaces raw TCP server with an HTTP POST endpoint for data ingestion.
  - Keeps dashboard, Socket.IO, and data broadcasting features.
*/

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from assets directory
app.use("/assets", express.static(__dirname + "/assets"));

const server = http.createServer(app);
const io = socketIo(server);

let participantData = [];
let sharedMessages = [];
let socketClients = [];

// ------------------------ HTML Dashboard ------------------------
const dashboardHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Participant Data Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .grid-container {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 8px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .grid-header {
      font-weight: bold;
      background: #f2f2f2;
      padding: 8px;
      border-bottom: 1px solid #ddd;
    }
    .grid-item {
      padding: 8px;
      border-bottom: 1px solid #eee;
    }
    .flex-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    #msg {
      flex: 1;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    button {
      padding: 8px 16px;
      border: none;
      background: #007bff;
      color: #fff;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #0056b3;
    }
    #messages {
      margin-top: 16px;
      list-style-type: none;
      padding: 0;
      margin: 0;
    }
  </style>
</head>
<body>
  <h2>Participant Data Dashboard</h2>
  <button id="enable-sound" style="margin-bottom:16px;">Enable Sound Notifications</button>
  <div class="client-info" id="client-info">Connected clients: 0</div>
  <div class="grid-container" id="data-grid">
    <div class="grid-header">Time Received</div>
    <div class="grid-header">Data</div>
    <!-- Data rows will be injected here -->
  </div>
  <h2>Shared Messages</h2>
  <ul id="messages"></ul>

  <script src="/socket.io/socket.io.js"></script>
  <audio id="beep-audio" src="/assets/short-beep-tone-47916.mp3" preload="auto" style="display:none"></audio>
  <script>
    const socket = io();

    // Enable audio
    document.getElementById('enable-sound').onclick = function() {
      let audio = document.getElementById('beep-audio');
      if (audio) {
        audio.volume = 0;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
          document.getElementById('enable-sound').style.display = 'none';
        });
      }
    };

    socket.on('clientInfo', info => {
      const el = document.getElementById('client-info');
      el.innerHTML = '<div>Connected clients: ' + info + '</div>';
    });

    socket.on('data', items => {
      const grid = document.getElementById('data-grid');
      while (grid.children.length > 2) grid.removeChild(grid.lastChild);
      items.forEach(({timestamp, message}) => {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'grid-item';
        timeDiv.textContent = new Date(timestamp).toLocaleTimeString();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'grid-item';
        msgDiv.textContent = message;
        grid.appendChild(timeDiv);
        grid.appendChild(msgDiv);
      });
    });

    socket.on('beep', () => {
      let audio = document.getElementById('beep-audio');
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          document.getElementById('enable-sound').style.display = '';
        });
      }
    });

    socket.on('message', sharedMessages => {
      const ul = document.getElementById('messages');
      ul.innerHTML = '';
      sharedMessages.forEach(({ timestamp, message }) => {
        ul.innerHTML += '<li>' + new Date(timestamp).toLocaleTimeString() + ': ' + message + '</li>';
      });
    });
  </script>
</body>
</html>
`;

// ------------------------ Routes ------------------------
app.get("/", (req, res) => {
  res.send(dashboardHTML);
});

app.get("/api/data", (req, res) => {
  res.json({
    participantData,
    sharedMessages
  });
});

// This replaces the TCP server
app.post("/api/push", (req, res) => {
  const dataObject = req.body;
  if (!dataObject || !dataObject.type || !dataObject.content) {
    return res.status(400).json({ error: "Invalid data format" });
  }

  if (dataObject.type === "experiment") {
    participantData.push({
      timestamp: Date.now(),
      message: dataObject.content,
    });
    io.emit("data", participantData.toReversed());
  } else if (dataObject.type === "user") {
    sharedMessages.push({
      timestamp: Date.now(),
      message: dataObject.content,
    });
    io.emit("message", sharedMessages.toReversed());
  }

  io.emit("beep");
  res.sendStatus(200);
});

// ------------------------ Socket.IO ------------------------
io.on("connection", (socket) => {
  socket.emit("data", participantData.toReversed());
  io.emit("message", sharedMessages.toReversed());

  socketClients.push({ id: socket.id });
  io.emit("clientInfo", socketClients.length);

  socket.on("disconnect", () => {
    socketClients = socketClients.filter(client => client.id !== socket.id);
    io.emit("clientInfo", socketClients.length);
  });
});

// ------------------------ Start Server ------------------------
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

