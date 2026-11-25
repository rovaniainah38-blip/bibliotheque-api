const { DatabaseSync } = require('node:sqlite'); // intégré à Node, aucune compilation
const db = new DatabaseSync(process.env.DB_PATH || 'library.db');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, nationality TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, isbn TEXT, year INTEGER,
  available INTEGER DEFAULT 1,
  author_id INTEGER REFERENCES authors(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  summary TEXT,
  summary_model TEXT,
  summary_generated_at TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  subscription_status TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free','premium'))
);
CREATE TABLE IF NOT EXISTS borrows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name TEXT NOT NULL,
  book_id INTEGER NOT NULL REFERENCES books(id),
  borrowed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  returned_at TEXT,
  payment_status TEXT NOT NULL DEFAULT 'free'
    CHECK (payment_status IN ('pending','paid','free'))
);
`);

if (db.prepare('SELECT COUNT(*) c FROM authors').get().c === 0) {
  const a = db.prepare('INSERT INTO authors(first_name,last_name,nationality) VALUES (?,?,?)');
  const b = db.prepare('INSERT INTO books(title,isbn,year,author_id) VALUES (?,?,?,?)');
  const martin = a.run('Robert C.', 'Martin', 'US').lastInsertRowid;
  const hugo = a.run('Victor', 'Hugo', 'FR').lastInsertRowid;
  b.run('Clean Code', '9780132350884', 2008, martin);
  b.run('Clean Architecture', '9780134494166', 2017, martin);
  b.run('Les Misérables', '9782070409228', 1862, hugo);
}
module.exports = db;