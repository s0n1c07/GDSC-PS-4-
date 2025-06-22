// --- START OF FILE server.js (Final, Complete, and Fully Logged Version) ---

const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./database.js');
const axios = require('axios');
const cheerio = require('cheerio');
const bcrypt = require('bcryptjs');
const { getSummaryWithProgress } = require('./llm_runner.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const JWT_SECRET = 'your-very-secret-key-for-jwt';
const processingQueue = [];
let isProcessing = false;
const clients = new Map();

// --- WebSocket Logic ---
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'status_update', isProcessing }));
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'register' && data.userId) {
        clients.set(data.userId, ws);
      }
    } catch (e) { console.error("[WebSocket] Message parse error", e); }
  });
  ws.on('close', () => {
    for (let [userId, clientWs] of clients.entries()) {
      if (clientWs === ws) { clients.delete(userId); break; }
    }
  });
});

function broadcast(message) { wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(message)) }); }
function sendMessageToUser(userId, message) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

// --- Main Application Setup ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

// --- LLM Queue Processor ---
async function processQueue() {
  console.log('[SERVER] processQueue function entered.');
  if (isProcessing || processingQueue.length === 0) {
    if (!isProcessing) broadcast({ type: 'status_update', isProcessing: false });
    return;
  }

  isProcessing = true;
  broadcast({ type: 'status_update', isProcessing: true });

  const job = processingQueue.shift();
  console.log(`[SERVER] Picked up job for user ${job.userId}, URL: ${job.url}`);

  try {
    sendMessageToUser(job.userId, { type: 'queued', data: { url: job.url, title: job.title } });
    if (!job.text || job.text.length < 150) throw new Error("Not enough content provided by extension.");

    const onProgress = (percentage) => sendMessageToUser(job.userId, { type: 'progress', data: { url: job.url, percentage } });

    console.log('[SERVER] Handing off job to LLM Runner...');
    const summary = await getSummaryWithProgress(job.text, onProgress);
    console.log('[SERVER] Received summary back from LLM Runner.');

    db.run('INSERT INTO saved_items (user_id, url, title, original_text_snippet, extracted_summary) VALUES (?, ?, ?, ?, ?)',
      [job.userId, job.url, job.title, job.text.substring(0, 500), summary], function (err) {
        if (err) throw new Error(`Database insert failed: ${err.message}`);
      });

    sendMessageToUser(job.userId, { type: 'complete', data: { url: job.url, title: job.title, summary } });
    console.log(`[SERVER] Job for ${job.url} completed successfully.`);

  } catch (error) {
    console.error(`[SERVER] ERROR during job processing for ${job.url}:`, error.message);
    sendMessageToUser(job.userId, { type: 'error', data: { url: job.url, message: error.message } });
  } finally {
    isProcessing = false;
    // Check for more items in the queue
    processQueue();
  }
}

// --- API Routes ---
app.post('/api/users/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: "All fields are required." });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword], (err) => {
      if (err) return res.status(409).json({ message: "Username already exists." });
      res.status(201).json({ message: "User registered successfully." });
    });
  } catch (error) {
    res.status(500).json({ message: "Server error during registration." });
  }
});

app.post('/api/users/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: "Login successful", userId: user.id, username: user.username, token });
  });
});

app.post('/api/process-url', authenticateToken, (req, res) => {
  const { url, title, text } = req.body;
  const userId = req.user.userId;
  console.log(`[SERVER] Received POST to /api/process-url for user ${userId}`);

  if (!url || !userId || !text) return res.status(400).json({ message: "URL, UserID, and Text are required." });

  if (processingQueue.some(item => item.url === url && item.userId === userId)) {
    return res.status(202).json({ message: "URL is already in the queue." });
  }

  processingQueue.push({ url, userId, title, text });
  console.log(`[SERVER] Added item to queue. Queue length is now ${processingQueue.length}`);

  // Trigger the queue processor if it's not busy.
  if (!isProcessing) {
    processQueue();
  }

  res.status(202).json({ message: "URL accepted for processing." });
});

app.get('/api/users', (req, res) => {
  db.all("SELECT id, username FROM users", [], (err, users) => {
    if (err) return res.status(500).json({ message: "Error fetching users." });
    res.json(users || []);
  });
});

app.get('/api/users/:userId/items', (req, res) => {
  const { userId } = req.params;
  db.all(`SELECT id, url, title, extracted_summary, created_at FROM saved_items WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, items) => {
    if (err) return res.status(500).json({ message: "Error fetching items." });
    res.json(items || []);
  });
});

// --- SPA Catch-all Route ---
// This serves your main index.html file for any non-api request.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server ---
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, table) => {
    if (err) console.error("Database connection error:", err.message);
    else console.log("Database connection successful.");
  });
});