'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { get } = require('../server/db');
const {
  TEST_PASSWORD,
  createTestContext,
  getCsrf,
  register,
  login,
  sessionSid
} = require('./helpers');

test('registrasi, login, rotasi sesi, pemulihan sesi, dan logout bekerja', async () => {
  const ctx = await createTestContext();
  try {
    const anonymous = await ctx.agent.get('/api/auth/csrf');
    const sidBeforeLogin = sessionSid(anonymous);
    assert.ok(sidBeforeLogin);

    const registerResponse = await ctx.agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', anonymous.body.csrfToken)
      .send({ username: '  Anggota_A  ', password: TEST_PASSWORD });
    assert.equal(registerResponse.status, 201);
    assert.equal(registerResponse.body.user.username, 'anggota_a');

    const stored = await get(ctx.db, 'SELECT password_hash FROM users WHERE username = ?', ['anggota_a']);
    assert.ok(stored.password_hash.startsWith('scrypt$1$'));
    assert.ok(!stored.password_hash.includes(TEST_PASSWORD));

    const loginResponse = await ctx.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', anonymous.body.csrfToken)
      .send({ username: 'anggota_a', password: TEST_PASSWORD });

    assert.equal(loginResponse.status, 200);
    assert.ok(loginResponse.body.csrfToken);
    assert.notEqual(loginResponse.body.csrfToken, anonymous.body.csrfToken);

    const sidAfterLogin = sessionSid(loginResponse);
    assert.ok(sidAfterLogin);
    assert.notEqual(sidAfterLogin, sidBeforeLogin);
    assert.equal(
      await get(ctx.db, 'SELECT sid FROM sessions WHERE sid = ?', [sidBeforeLogin]),
      undefined
    );
    assert.ok(await get(ctx.db, 'SELECT sid FROM sessions WHERE sid = ?', [sidAfterLogin]));

    const cookie = loginResponse.headers['set-cookie'].join(';');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.doesNotMatch(cookie, /; Secure/i);

    const sessionRestore = await ctx.agent.get('/api/auth/me');
    assert.equal(sessionRestore.status, 200);
    assert.equal(sessionRestore.body.authenticated, true);
    assert.equal(sessionRestore.body.user.username, 'anggota_a');

    const logoutResponse = await ctx.agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', loginResponse.body.csrfToken)
      .send({});
    assert.equal(logoutResponse.status, 200);

    const afterLogout = await ctx.agent.get('/api/auth/me');
    assert.equal(afterLogout.body.authenticated, false);
    const privateAfterLogout = await ctx.agent.get('/api/files');
    assert.equal(privateAfterLogout.status, 401);
  } finally {
    await ctx.close();
  }
});

test('username duplikat, username tidak valid, dan password lemah ditolak', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'duplikat');
    const duplicate = await register(ctx.agent, 'DUPLIKAT');
    assert.equal(duplicate.response.status, 409);

    const invalidUsername = await register(ctx.agent, 'a!');
    assert.equal(invalidUsername.response.status, 400);

    const weakPassword = await register(ctx.agent, 'password_lemah', 'pendek');
    assert.equal(weakPassword.response.status, 400);

    const tooLong = await register(ctx.agent, 'password_panjang', 'x'.repeat(129));
    assert.equal(tooLong.response.status, 400);
  } finally {
    await ctx.close();
  }
});

test('login gagal generik dan tidak membocorkan username', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'pemilik');
    const csrf = await getCsrf(ctx.agent);
    const wrong = await ctx.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ username: 'pemilik', password: 'password-yang-salah' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'AUTH_INVALID');

    const missing = await ctx.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ username: 'tidak-ada', password: 'password-yang-salah' });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.code, 'AUTH_INVALID');
    assert.deepEqual(missing.body, wrong.body);
  } finally {
    await ctx.close();
  }
});

test('endpoint privat membutuhkan autentikasi dan CSRF', async () => {
  const ctx = await createTestContext();
  try {
    for (const path of ['/api/files', '/api/files/1/download', '/api/files/1/ciphertext', '/api/benchmark/latest']) {
      const unauthenticated = await ctx.agent.get(path);
      assert.equal(unauthenticated.status, 401, path);
    }
    const unauthenticatedDelete = await ctx.agent.delete('/api/files/1');
    assert.equal(unauthenticatedDelete.status, 401);

    const csrfMissing = await ctx.agent
      .post('/api/auth/register')
      .send({ username: 'tanpa_csrf', password: TEST_PASSWORD });
    assert.equal(csrfMissing.status, 403);
    assert.equal(csrfMissing.body.error.code, 'CSRF_FAILED');

    const csrf = await getCsrf(ctx.agent);
    const withCsrf = await ctx.agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({ username: 'dengan_csrf', password: TEST_PASSWORD });
    assert.equal(withCsrf.status, 201);
  } finally {
    await ctx.close();
  }
});

test('rate limit autentikasi aktif sesuai konfigurasi', async () => {
  const ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX: '2' });
  try {
    for (let index = 0; index < 2; index += 1) {
      const { response } = await register(ctx.agent, `pengguna_${index}`);
      assert.equal(response.status, 201);
    }
    const third = await register(ctx.agent, 'pengguna_ketiga');
    assert.equal(third.response.status, 429);
    assert.equal(third.response.body.error.code, 'AUTH_RATE_LIMITED');
  } finally {
    await ctx.close();
  }
});

test('login valid dapat dipulihkan pada sesi baru setelah login ulang', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'sesi_baru');
    const first = await login(ctx.agent, 'sesi_baru');
    assert.equal(first.response.status, 200);

    const secondAgent = request.agent(ctx.app);
    const second = await login(secondAgent, 'sesi_baru');
    assert.equal(second.response.status, 200);

    const me = await secondAgent.get('/api/auth/me');
    assert.equal(me.body.authenticated, true);
    assert.equal(me.body.user.username, 'sesi_baru');
  } finally {
    await ctx.close();
  }
});
