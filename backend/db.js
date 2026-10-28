const Database = require('better-sqlite3'), path = require('path'), bcrypt = require('bcryptjs');
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, email TEXT, must_change INTEGER DEFAULT 1, reset_token TEXT, reset_exp INTEGER);
CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, name TEXT, title TEXT, type TEXT, original TEXT, stored TEXT, size INTEGER, sku_count INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY, file_id INTEGER REFERENCES files(id) ON DELETE CASCADE, sku TEXT, sku_display TEXT, text TEXT, html TEXT, images TEXT, videos TEXT, links TEXT, page INTEGER);
CREATE INDEX IF NOT EXISTS ix_sku ON entries(sku);`);
if (!db.prepare('SELECT 1 FROM users').get())
  db.prepare('INSERT INTO users(username,password,email) VALUES(?,?,?)').run('admin', bcrypt.hashSync('admin123', 10), process.env.ADMIN_EMAIL || null);
module.exports = db;
