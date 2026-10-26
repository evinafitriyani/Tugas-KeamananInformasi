'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');

function openDatabase(filename) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, (error) => {
      if (error) {
        reject(error);
        return;
      }
      db.configure('busyTimeout', 5000);
      db.run('PRAGMA foreign_keys = ON', (pragmaError) => {
        if (pragmaError) {
          reject(pragmaError);
          return;
        }
        resolve(db);
      });
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => (error ? reject(error) : resolve()));
  });
}

async function withTransaction(db, work) {
  await exec(db, 'BEGIN IMMEDIATE');
  try {
    const result = await work();
    await exec(db, 'COMMIT');
    return result;
  } catch (error) {
    try {
      await exec(db, 'ROLLBACK');
    } catch {
      // The original error is more useful.
    }
    throw error;
  }
}

async function migrate(db, migrationsDir) {
  await exec(db, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const entries = await fs.readdir(migrationsDir);
  const files = entries.filter((name) => name.endsWith('.sql')).sort();

  for (const name of files) {
    const applied = await get(db, 'SELECT name FROM schema_migrations WHERE name = ?', [name]);
    if (applied) continue;

    const sql = await fs.readFile(path.join(migrationsDir, name), 'utf8');
    await exec(db, 'BEGIN IMMEDIATE');
    try {
      await exec(db, sql);
      await run(db, 'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [
        name,
        new Date().toISOString()
      ]);
      await exec(db, 'COMMIT');
    } catch (error) {
      await exec(db, 'ROLLBACK');
      throw new Error(`Migrasi gagal (${name}): ${error.message}`);
    }
  }
}

module.exports = {
  openDatabase,
  closeDatabase,
  run,
  get,
  all,
  exec,
  withTransaction,
  migrate
};
