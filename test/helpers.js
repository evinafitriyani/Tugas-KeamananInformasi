'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const request = require('supertest');
const { loadConfig } = require('../server/config');
const { openDatabase, closeDatabase, migrate } = require('../server/db');
const { createApp } = require('../server/app');

const TEST_PASSWORD = 'correct horse battery staple';

async function createTestContext(overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'campusvault-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    CAMPUSVAULT_MASTER_KEY: Buffer.alloc(48, 7).toString('base64'),
    SESSION_SECRET: 'test-session-secret-that-is-long-enough-1234567890',
    DATABASE_PATH: path.join(dir, 'database.sqlite'),
    STORAGE_DIR: path.join(dir, 'storage'),
    SESSION_TTL_MS: '3600000',
    MAX_UPLOAD_BYTES: '26214400',
    AUTH_RATE_LIMIT_MAX: '1000',
    API_RATE_LIMIT_MAX: '10000',
    RATE_LIMIT_WINDOW_MS: '60000',
    ...overrides
  });
  await fs.mkdir(config.storageDir, { recursive: true });
  const db = await openDatabase(config.databasePath);
  await migrate(db, config.migrationsDir);
  const app = createApp({ db, config });

  return {
    dir,
    config,
    db,
    app,
    agent: request.agent(app),
    async close() {
      await closeDatabase(db);
      await fs.rm(dir, { recursive: true, force: true });
    }
  };
}

async function getCsrf(agent) {
  const response = await agent.get('/api/auth/csrf').expect(200);
  return response.body.csrfToken;
}

async function register(agent, username, password = TEST_PASSWORD) {
  const csrf = await getCsrf(agent);
  const response = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({ username, password });
  return { response, csrf };
}

async function login(agent, username, password = TEST_PASSWORD) {
  const csrf = await getCsrf(agent);
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ username, password });
  return { response, csrf: response.body.csrfToken || csrf };
}

async function upload(agent, csrf, file, algorithm = 'AES') {
  return agent
    .post('/api/files')
    .set('X-CSRF-Token', csrf)
    .field('algorithm', algorithm)
    .attach('file', file.buffer, { filename: file.filename, contentType: file.mime });
}

function csvFixture() {
  return {
    filename: 'dummy.csv',
    mime: 'text/csv',
    buffer: Buffer.from('id,nama\n1,Anggota Dummy\n', 'utf8')
  };
}

function pdfFixture() {
  return {
    filename: 'dummy.pdf',
    mime: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'ascii')
  };
}

function pngFixture() {
  return {
    filename: 'dummy.png',
    mime: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0S8AAAAASUVORK5CYII=',
      'base64'
    )
  };
}

function docxFixture() {
  return {
    filename: 'dummy.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('synthetic-docx-placeholder', 'utf8')
    ])
  };
}

function mp4Fixture() {
  return {
    filename: 'dummy.mp4',
    mime: 'video/mp4',
    buffer: Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypmp42', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('synthetic-video', 'utf8')
    ])
  };
}

function randomBuffer(size = 128) {
  return crypto.randomBytes(size);
}

module.exports = {
  TEST_PASSWORD,
  createTestContext,
  getCsrf,
  register,
  login,
  upload,
  csvFixture,
  pdfFixture,
  pngFixture,
  docxFixture,
  mp4Fixture,
  randomBuffer
};
