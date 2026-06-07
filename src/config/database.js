const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { initSchema } = require('./schema');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'divination.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

initSchema(db);

module.exports = db;
