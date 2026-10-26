'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openDatabase, closeDatabase, migrate, get, run } = require('../server/db');

test('migrasi database kosong berjalan idempoten dan foreign key aktif', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'campusvault-db-test-'));
  const databasePath = path.join(directory, 'database.sqlite');
  const migrationsDir = path.join(__dirname, '..', 'server', 'migrations');
  let db;
  try {
    db = await openDatabase(databasePath);
    await migrate(db, migrationsDir);
    await migrate(db, migrationsDir);

    const applied = await get(db, 'SELECT name FROM schema_migrations WHERE name = ?', [
      '001_initial.sql'
    ]);
    assert.ok(applied);

    const tables = await fs.readFile(databasePath);
    assert.ok(tables.length > 0);

    await assert.rejects(
      run(db, 'INSERT INTO files (owner_id, original_filename, storage_filename, mime_type, ' +
        'original_size_bytes, encrypted_size_bytes, algorithm, mode, envelope_version, ' +
        'original_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        999,
        'x.csv',
        'random.json',
        'text/csv',
        1,
        1,
        'AES',
        'CBC',
        1,
        '0'.repeat(64),
        new Date().toISOString()
      ]),
      /FOREIGN KEY/
    );
  } finally {
    if (db) await closeDatabase(db);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
