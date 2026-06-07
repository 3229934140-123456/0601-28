const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'divination.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function hasColumn(table, column) {
  const cols = db.pragma(`table_info(${table})`);
  return cols.some(c => c.name === column);
}

if (!hasColumn('interpretation', 'status')) {
  db.exec(`ALTER TABLE interpretation ADD COLUMN status INTEGER DEFAULT 1`);
}

if (!hasColumn('fortune_result', 'result_type')) {
  db.exec(`ALTER TABLE fortune_result ADD COLUMN result_type TEXT DEFAULT 'draw'`);
}

if (!hasColumn('fortune_result', 'share_count')) {
  db.exec(`ALTER TABLE fortune_result ADD COLUMN share_count INTEGER DEFAULT 0`);
}

module.exports = db;
