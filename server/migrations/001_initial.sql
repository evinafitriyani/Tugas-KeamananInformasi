-- CampusVault initial schema
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires);

CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  storage_filename TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  original_size_bytes INTEGER NOT NULL CHECK (original_size_bytes > 0),
  encrypted_size_bytes INTEGER NOT NULL CHECK (encrypted_size_bytes > 0),
  algorithm TEXT NOT NULL CHECK (algorithm IN ('AES', 'DES', 'RC4')),
  mode TEXT NOT NULL CHECK (mode IN ('CBC', 'STREAM')),
  envelope_version INTEGER NOT NULL CHECK (envelope_version = 1),
  original_sha256 TEXT NOT NULL CHECK (length(original_sha256) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_files_owner ON files(owner_id, id);
