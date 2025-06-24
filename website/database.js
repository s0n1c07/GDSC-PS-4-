// --- START OF FILE database.js (No Corrections Needed) ---

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Use a file for persistent storage
const DBSOURCE = "database.db";

const db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Connected to the SQLite database.');
        db.serialize(() => { // Use serialize to ensure statements run in order
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password_hash TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) console.error("Error creating users table", err);
            });

            db.run(`CREATE TABLE IF NOT EXISTS saved_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                url TEXT,
                title TEXT,
                original_text_snippet TEXT,
                extracted_summary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) console.error("Error creating saved_items table", err);
            });

            db.run(`CREATE TABLE IF NOT EXISTS follows (
                follower_id INTEGER,
                following_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (follower_id, following_id),
                FOREIGN KEY (follower_id) REFERENCES users(id),
                FOREIGN KEY (following_id) REFERENCES users(id)
            )`, (err) => {
                if (err) console.error("Error creating follows table", err);
            });
        });
    }
});

module.exports = db;