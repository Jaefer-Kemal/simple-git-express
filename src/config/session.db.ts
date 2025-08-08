// src/config/session.db.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(__dirname, '../../session.sqlite');

// Optionally ensure directory exists (if using a nested path)
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);

// Initialize schema once
db.pragma('journal_mode = WAL'); // optional performance/safety tweak
db.exec(/* sql */ `
  CREATE TABLE IF NOT EXISTS session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accessToken TEXT,
    refreshToken TEXT,
    accessTokenExpiresAt DATETIME,
    refreshTokenExpiresAt DATETIME,
    userId TEXT,
    email TEXT,
    userType TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export const getSessionDb = () => db;
