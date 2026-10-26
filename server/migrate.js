'use strict';

require('dotenv').config();

const { loadConfig } = require('./config');
const { openDatabase, closeDatabase, migrate } = require('./db');

async function main() {
  const config = loadConfig();
  const fs = require('node:fs/promises');
  const path = require('node:path');
  await fs.mkdir(path.dirname(config.databasePath), { recursive: true });
  const db = await openDatabase(config.databasePath);
  try {
    await migrate(db, config.migrationsDir);
    console.info('Migrasi database selesai.');
  } finally {
    await closeDatabase(db);
  }
}

main().catch((error) => {
  console.error('migrate.failed', { name: error.name, message: error.message });
  process.exit(1);
});
