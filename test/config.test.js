'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadConfig, MAX_UPLOAD_BYTES } = require('../server/config');
const { cookieOptions } = require('../server/routes/auth');
const { testEnvironment } = require('./helpers');

function baseEnvironment(overrides = {}) {
  return testEnvironment(path.join(os.tmpdir(), 'campusvault-config-test'), overrides);
}

test('konfigurasi gagal saat master key atau session secret tidak valid', () => {
  const missing = baseEnvironment();
  delete missing.CAMPUSVAULT_MASTER_KEY;
  assert.throws(() => loadConfig(missing), /CAMPUSVAULT_MASTER_KEY/);

  const malformed = baseEnvironment({ CAMPUSVAULT_MASTER_KEY: 'bukan base64!' });
  assert.throws(() => loadConfig(malformed), /Base64/);

  const shortKey = baseEnvironment({
    CAMPUSVAULT_MASTER_KEY: crypto.randomBytes(16).toString('base64')
  });
  assert.throws(() => loadConfig(shortKey), /minimal 32 byte/);

  const shortSession = baseEnvironment({ SESSION_SECRET: 'pendek' });
  assert.throws(() => loadConfig(shortSession), /SESSION_SECRET/);
});

test('batas unggah tidak dapat melebihi 25 MiB dan nilai lebih kecil dihormati', () => {
  const capped = loadConfig(baseEnvironment({ MAX_UPLOAD_BYTES: '999999999' }));
  assert.equal(capped.maxUploadBytes, MAX_UPLOAD_BYTES);

  const smaller = loadConfig(baseEnvironment({ MAX_UPLOAD_BYTES: '10' }));
  assert.equal(smaller.maxUploadBytes, 10);

  const fallback = loadConfig(baseEnvironment({ MAX_UPLOAD_BYTES: 'tidak-valid' }));
  assert.equal(fallback.maxUploadBytes, MAX_UPLOAD_BYTES);
});

test('cookie sesi memakai Secure hanya pada mode produksi', () => {
  const development = loadConfig(baseEnvironment());
  const production = loadConfig(baseEnvironment({ NODE_ENV: 'production' }));

  const devCookie = cookieOptions(development);
  assert.equal(devCookie.httpOnly, true);
  assert.equal(devCookie.sameSite, 'lax');
  assert.equal(devCookie.secure, false);

  const prodCookie = cookieOptions(production);
  assert.equal(prodCookie.httpOnly, true);
  assert.equal(prodCookie.sameSite, 'lax');
  assert.equal(prodCookie.secure, true);
});

test('path runtime dan benchmark dapat diarahkan untuk pengujian', () => {
  const config = loadConfig(baseEnvironment({
    HOST: '127.0.0.2',
    BENCHMARK_RESULTS_DIR: path.join(os.tmpdir(), 'campusvault-bench-output')
  }));
  assert.equal(config.host, '127.0.0.2');
  assert.equal(config.benchmarkResultsDir, path.join(os.tmpdir(), 'campusvault-bench-output'));
  assert.equal(config.sessionTtlMs, 3600000);
});
