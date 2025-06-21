// --- START OF FILE server.js ---
const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const db = require("./database.js");
const axios = require("axios");
const cheerio = require("cheerio");
const bcrypt = require("bcryptjs");
const { YoutubeTranscript } = require("youtube-transcript");
const { getSummaryWithProgress } = require("./llm_runner.js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const JWT_SECRET = "your-very-secret-key-for-jwt";
const processingQueue = [];
let isProcessing = false;
const clients = new Map();

// WebSocket Logic
wss.on("connection", (ws) => {
  console.log("Client connected to WebSocket.");
  ws.send(JSON.stringify({ type: "status_update", isProcessing }));
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "register" && data.userId) {
        clients.set(data.userId, ws);
        console.log(`User ${data.userId} registered WebSocket connection.`);
      }
    } catch (e) {
      console.log("Received non-JSON message.");
    }
  });
  ws.on("close", () => {
    console.log("Client disconnected.");
    for (let [userId, clientWs] of clients.entries()) {
      if (clientWs === ws) {
        clients.delete(userId);
        break;
      }
    }
  });
});

function broadcast(message) {
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(message));
  });
}
function sendMessageToUser(userId, message) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

// Main Application Setup
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ message: "Invalid or expired token." });
    req.user = user;
    next();
  });
};

// LLM Queue Processor
async function processQueue() {
  if (isProcessing || processingQueue.length === 0) {
    isProcessing = false;
    broadcast({ type: "status_update", isProcessing: false });
    return;
  }
  isProcessing = true;
  broadcast({ type: "status_update", isProcessing: true });

  const { url, userId, title, text } = processingQueue.shift(); // Now expecting title and text

  try {
    sendMessageToUser(userId, { type: "queued", data: { url, title: title } });

    if (!text || text.length < 150)
      throw new Error("Not enough content provided by extension.");

    const onProgress = (percentage) =>
      sendMessageToUser(userId, {
        type: "progress",
        data: { url, percentage },
      });
    const summary = await getSummaryWithProgress(text, onProgress);

    db.run(
      "INSERT INTO saved_items (user_id, url, title, original_text_snippet, extracted_summary) VALUES (?, ?, ?, ?, ?)",
      [userId, url, title, text.substring(0, 500), summary]
    );

    sendMessageToUser(userId, {
      type: "complete",
      data: { url, title: title, summary },
    });
  } catch (error) {
    console.error(`Failed to process ${url}:`, error.message);
    sendMessageToUser(userId, {
      type: "error",
      data: { url, message: error.message },
    });
  }

  isProcessing = false;
  processQueue();
}
// API Routes
app.post("/api/users/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "All fields required." });
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run(
    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
    [username, hashedPassword],
    (err) => {
      if (err)
        return res.status(409).json({ message: "Username already exists." });
      res.status(201).json({ message: "User registered successfully." });
    }
  );
});

app.post("/api/users/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (
        err ||
        !user ||
        !(await bcrypt.compare(password, user.password_hash))
      ) {
        return res.status(401).json({ message: "Invalid credentials." });
      }
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      res.json({
        message: "Login successful",
        userId: user.id,
        username: user.username,
        token,
      });
    }
  );
});

app.post("/api/process-url", authenticateToken, (req, res) => {
  const { url, title, text } = req.body;
  const userId = req.user.userId;
  if (
    processingQueue.some((item) => item.url === url && item.userId === userId)
  ) {
    return res.status(202).json({ message: "URL is already in the queue." });
  }
  // Add the new data to the queue
  processingQueue.push({ url, userId, title, text });
  if (!isProcessing) processQueue();
  res.status(202).json({ message: "URL accepted for processing." });
});

app.get("/api/users", (req, res) => {
  db.all("SELECT id, username FROM users", [], (err, users) =>
    res.json(users || [])
  );
});

app.get("/api/users/:userId/items", (req, res) => {
  const { userId } = req.params;
  db.all(
    `SELECT id, url, title, extracted_summary, created_at FROM saved_items WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, items) => res.json(items || [])
  );
});

// SPA Catch-all Route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
