'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { get } = require('../server/db');
const {
  TEST_PASSWORD,
  createTestContext,
  getCsrf,
  register,
  login
} = require('./helpers');

test('registrasi, login, pemulihan sesi, dan logout bekerja', async () => {
  const ctx = await createTestContext();
  try {
    const { response: registerResponse } = await register(ctx.agent, 'anggota_a');
    assert.equal(registerResponse.status, 201);
    assert.equal(registerResponse.body.user.username, 'anggota_a');

    const stored = await get(ctx.db, 'SELECT password_hash FROM users WHERE username = ?', ['anggota_a']);
    assert.ok(stored.password_hash.startsWith('scrypt$'));
    assert.ok(!stored.password_hash.includes(TEST_PASSWORD));

    const csrfBeforeLogin = await getCsrf(ctx.agent);
    const beforeCookies = await ctx.agent.get('/api/auth/me');
    const loginResponse = await ctx.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfBeforeLogin)
      .send({ username: 'anggota_a', password: TEST_PASSWORD });

    assert.equal(loginResponse.status, 200);
    assert.ok(loginResponse.body.csrfToken);
    assert.notEqual(loginResponse.body.csrfToken, csrfBeforeLogin);

    const cookie = loginResponse.headers['set-cookie'].join(';');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.doesNotMatch(cookie, /; Secure/i);

    const afterCookies = await ctx.agent.get('/api/auth/me');
    assert.equal(afterCookies.body.authenticated, true);
    assert.equal(afterCookies.body.user.username, 'anggota_a');
    assert.notEqual(
      beforeCookies.headers['set-cookie'] && beforeCookies.headers['set-cookie'].join(';'),
      loginResponse.headers['set-cookie'].join(';')
    );

    const logoutResponse = await ctx.agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', loginResponse.body.csrfToken)
      .send({});
    assert.equal(logoutResponse.status, 200);
    const afterLogout = await ctx.agent.get('/api/auth/me');
    assert.equal(afterLogout.body.authenticated, false);
  } finally {
    await ctx.close();
  }
});

test('username duplikat, username tidak valid, dan password lemah ditolak', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'duplikat');
    const duplicate = await register(ctx.agent, 'duplikat');
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
  } finally {
    await ctx.close();
  }
});

test('endpoint privat membutuhkan autentikasi dan CSRF', async () => {
  const ctx = await createTestContext();
  try {
    const unauthenticated = await ctx.agent.get('/api/files');
    assert.equal(unauthenticated.status, 401);

    const csrfMissing = await ctx.agent
      .post('/api/auth/register')
      .send({ username: 'tanpa_csrf', password: TEST_PASSWORD });
    assert.equal(csrfMissing.status, 403);
    assert.equal(csrfMissing.body.error.code, 'CSRF_FAILED');

    const csrf = await getCsrf(ctx.agent);
    const authenticatedButNoCsrf = await ctx.agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({ username: 'dengan_csrf', password: TEST_PASSWORD });
    assert.equal(authenticatedButNoCsrf.status, 201);
  } finally {
    await ctx.close();
  }
});

test('rate limit autentikasi aktif sesuai konfigurasi', async () => {
  const ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX: '2' });
  try {
    for (let index = 0; index < 2; index += 1) {
      const csrf = await getCsrf(ctx.agent);
      const response = await ctx.agent
        .post('/api/auth/register')
        .set('X-CSRF-Token', csrf)
        .send({ username: `pengguna_${index}`, password: TEST_PASSWORD });
      assert.equal(response.status, 201);
    }
    const csrf = await getCsrf(ctx.agent);
    const limited = await ctx.agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({ username: 'pengguna_ketiga', password: TEST_PASSWORD });
    assert.equal(limited.status, 429);
  } finally {
    await ctx.close();
  }
});
