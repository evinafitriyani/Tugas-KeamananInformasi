'use strict';

require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { loadConfig } = require('./config');
const { openDatabase, closeDatabase, migrate } = require('./db');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig();
  await fs.mkdir(path.dirname(config.databasePath), { recursive: true });
  await fs.mkdir(config.storageDir, { recursive: true });
  await fs.mkdir(config.benchmarkResultsDir, { recursive: true });

  const db = await openDatabase(config.databasePath);
  try {
    await migrate(db, config.migrationsDir);
    const app = createApp({ db, config });
    const server = app.listen(config.port, config.host, () => {
      console.info(`CampusVault berjalan di http://${config.host}:${config.port}`);
    });

    const shutdown = async (signal) => {
      console.info(`Menerima ${signal}; menutup server.`);
      server.close(async () => {
        await closeDatabase(db).catch(() => {});
        process.exit(0);
      });
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    await closeDatabase(db).catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error('startup.failed', { name: error.name, message: error.message });
  process.exit(1);
});
