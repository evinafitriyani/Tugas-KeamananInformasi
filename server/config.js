'use strict';

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function required(env, name) {
  const value = env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Konfigurasi wajib tidak ditemukan: ${name}`);
  }
  return String(value);
}

function parseBase64Secret(value, name, minimumBytes) {
  const raw = required({ [name]: value }, name);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) {
    throw new Error(`${name} harus berupa Base64 yang valid`);
  }
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.toString('base64') !== raw) {
    throw new Error(`${name} harus berupa Base64 kanonis`);
  }
  if (buffer.length < minimumBytes) {
    throw new Error(`${name} harus minimal ${minimumBytes} byte setelah decode Base64`);
  }
  return buffer;
}

function positiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const masterKey = parseBase64Secret(
    required(env, 'CAMPUSVAULT_MASTER_KEY'),
    'CAMPUSVAULT_MASTER_KEY',
    32
  );

  const sessionSecret = required(env, 'SESSION_SECRET');
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET harus minimal 32 karakter');
  }

  return {
    rootDir: ROOT,
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    host: env.HOST || '127.0.0.1',
    port: positiveInt(env.PORT, 3000),
    databasePath: path.resolve(ROOT, env.DATABASE_PATH || 'server/data/database.sqlite'),
    storageDir: path.resolve(ROOT, env.STORAGE_DIR || 'server/data/storage'),
    publicDir: path.join(ROOT, 'public'),
    migrationsDir: path.join(__dirname, 'migrations'),
    benchmarkFixturesDir: path.join(ROOT, 'benchmark', 'fixtures'),
    benchmarkResultsDir: path.resolve(ROOT, env.BENCHMARK_RESULTS_DIR || 'benchmark/results'),
    masterKey,
    sessionSecret,
    sessionTtlMs: positiveInt(env.SESSION_TTL_MS, 2 * 60 * 60 * 1000),
    maxUploadBytes: Math.min(
      positiveInt(env.MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES),
      MAX_UPLOAD_BYTES
    ),
    authRateLimitMax: positiveInt(env.AUTH_RATE_LIMIT_MAX, 20),
    apiRateLimitMax: positiveInt(env.API_RATE_LIMIT_MAX, 300),
    rateLimitWindowMs: positiveInt(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    cookieName: 'campusvault.sid'
  };
}

module.exports = { loadConfig, MAX_UPLOAD_BYTES };
