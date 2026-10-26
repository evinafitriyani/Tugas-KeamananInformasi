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

function testEnvironment(directory, overrides = {}) {
  return {
    NODE_ENV: 'test',
    CAMPUSVAULT_MASTER_KEY: crypto.randomBytes(48).toString('base64'),
    SESSION_SECRET: crypto.randomBytes(48).toString('base64'),
    DATABASE_PATH: path.join(directory, 'database.sqlite'),
    STORAGE_DIR: path.join(directory, 'storage'),
    BENCHMARK_RESULTS_DIR: path.join(directory, 'benchmark-results'),
    SESSION_TTL_MS: '3600000',
    MAX_UPLOAD_BYTES: '26214400',
    AUTH_RATE_LIMIT_MAX: '1000',
    API_RATE_LIMIT_MAX: '10000',
    RATE_LIMIT_WINDOW_MS: '60000',
    ...overrides
  };
}

async function createTestContext(overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'campusvault-test-'));
  const config = loadConfig(testEnvironment(dir, overrides));
  await fs.mkdir(config.storageDir, { recursive: true });
  await fs.mkdir(config.benchmarkResultsDir, { recursive: true });
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

function sessionSid(response, cookieName = 'campusvault.sid') {
  const cookies = response.headers['set-cookie'] || [];
  for (const cookie of cookies) {
    const match = cookie.match(new RegExp(`^${cookieName}=([^;]*)`));
    if (!match) continue;
    let sid = decodeURIComponent(match[1]);
    // express-session signs cookies as s:<sid>.<signature>.
    if (sid.startsWith('s:')) sid = sid.slice(2);
    const separator = sid.lastIndexOf('.');
    if (separator !== -1) sid = sid.slice(0, separator);
    return sid;
  }
  return null;
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

function jpgFixture() {
  return {
    filename: 'dummy.jpg',
    mime: 'image/jpeg',
    buffer: Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x00, 0xff, 0xd9
    ])
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

function xlsxFixture() {
  return {
    filename: 'dummy.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('synthetic-xlsx-placeholder', 'utf8')
    ])
  };
}

function pptxFixture() {
  return {
    filename: 'dummy.pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('synthetic-pptx-placeholder', 'utf8')
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

function webmFixture() {
  return {
    filename: 'dummy.webm',
    mime: 'video/webm',
    buffer: Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from('synthetic-webm', 'utf8')
    ])
  };
}

function randomBuffer(size = 128) {
  return crypto.randomBytes(size);
}

module.exports = {
  TEST_PASSWORD,
  testEnvironment,
  createTestContext,
  getCsrf,
  register,
  login,
  upload,
  sessionSid,
  csvFixture,
  pdfFixture,
  pngFixture,
  jpgFixture,
  docxFixture,
  xlsxFixture,
  pptxFixture,
  mp4Fixture,
  webmFixture,
  randomBuffer
};
