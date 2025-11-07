/* 
strategy:
Create a Node.js server that listens for TCP connections from a Python client on port 10161. When data is received, store it in an array and broadcast it to connected web clients via Socket.IO.
*/

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const net = require("net");

const app = express();

// Serve static files from assets directory
app.use("/assets", express.static(__dirname + "/assets"));

const server = http.createServer(app);
const io = socketIo(server);

let participantData = [];
let sharedMessages = [];
let socketClients = [];

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve dashboard page
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
  <!-- Preload beep sound -->
  <audio id="beep-audio" src="/assets/short-beep-tone-47916.mp3" preload="auto" style="display:none"></audio>
      <script>
        const socket = io();

        // Unlock audio playback on user interaction
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

        // Listen for client info updates
        socket.on('clientInfo', info => {
          const el = document.getElementById('client-info');
          el.innerHTML = '<div>Connected clients: ' + info + '</div><br>' + '</div>';
        });

        // Listen for data updates
        socket.on('data', items => {
          const grid = document.getElementById('data-grid');
          // Remove old rows except headers
          while (grid.children.length > 2) grid.removeChild(grid.lastChild);
          items.forEach(({timestamp, message}, idx) => {
            const idxDiv = document.createElement('div');
            idxDiv.className = 'grid-item';
            idxDiv.textContent = new Date(timestamp).toLocaleTimeString();
            const dataDiv = document.createElement('div');
            dataDiv.className = 'grid-item';
            dataDiv.textContent = message;
            grid.appendChild(idxDiv);
            grid.appendChild(dataDiv);
          });
        });

          // Listen for beep event and play MP3 sound
          socket.on('beep', () => {
            let audio = document.getElementById('beep-audio');
            if (audio) {
              audio.currentTime = 0;
              audio.play().catch(() => {
                // If not allowed, show enable button again
                document.getElementById('enable-sound').style.display = '';
              });
            }
          });

        // Listen for chat messages
        socket.on('message', (sharedMessages) => {
          const ul = document.getElementById('messages');
          ul.innerHTML = ''; // Clear existing messages
          sharedMessages.forEach(({ timestamp, message }) => {
            ul.innerHTML += '<li>' + new Date(timestamp).toLocaleTimeString() + ': ' + message + '</li>';
          });
        });

      </script>
    </body>
    </html>
  `;

app.get("/", (req, res) => {
	res.send(dashboardHTML);
});

// API endpoint to get current data
app.get("/api/data", (req, res) => {
	res.json({
		participantData: participantData,
		sharedMessages: sharedMessages,
	});
});

// TCP server to receive data from Python client
const tcpServer = net.createServer((socket) => {
	let dataBuffer = "";
	socket.on("data", (data) => {
		dataBuffer += data.toString();
	});

	socket.on("end", () => {
		if (dataBuffer.trim()) {
			const dataObject = JSON.parse(dataBuffer);
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
			io.emit("beep"); // Emit beep event to all clients
		}
		dataBuffer = "";
	});

	socket.on("error", (err) => {
		console.error("TCP socket error:", err);
	});
});

tcpServer.listen(10161, () => {
	io.emit("beep"); // Emit beep event to all clients
});

io.on("connection", (socket) => {
	socket.emit("data", participantData.toReversed());
	io.emit("message", sharedMessages.toReversed());

	socketClients.push({ id: socket.id });
	io.emit("clientInfo", socketClients.length);

	socket.on("disconnect", () => {
		// Remove the disconnected socket from the array
		socketClients = socketClients.filter((client) => client.id !== socket.id);
		io.emit("clientInfo", socketClients.length);
	});
});

server.listen(5001, () => {
	console.log("Server running on http://127.0.0.1:5001");
});
