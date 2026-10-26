'use strict';

const express = require('express');
const { promisify } = require('node:util');
const { asyncHandler } = require('../utils/async-handler');
const { createUser, findUserByUsername, findUserById, verifyPassword } = require('../services/users');
const { requireCsrf, newToken } = require('../middleware/csrf');

function cookieOptions(config, includeMaxAge = true) {
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/'
  };
  if (includeMaxAge) options.maxAge = config.sessionTtlMs;
  return options;
}

function createAuthRouter({ db, config, authLimiter }) {
  const router = express.Router();

  router.get('/csrf', (req, res) => {
    res.json({ csrfToken: req.session.csrfToken });
  });

  router.get('/me', asyncHandler(async (req, res) => {
    if (!req.session.userId) {
      res.json({ authenticated: false, csrfToken: req.session.csrfToken });
      return;
    }
    const user = await findUserById(db, req.session.userId);
    if (!user) {
      req.session.userId = null;
      res.json({ authenticated: false, csrfToken: req.session.csrfToken });
      return;
    }
    res.json({
      authenticated: true,
      user: { id: user.id, username: user.username },
      csrfToken: req.session.csrfToken
    });
  }));

  router.post('/register', authLimiter, requireCsrf, asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const user = await createUser(db, username, password);
    console.info('auth.register.success');
    res.status(201).json({
      message: 'Akun berhasil dibuat. Silakan masuk.',
      user: { id: user.id, username: user.username }
    });
  }));

  router.post('/login', authLimiter, requireCsrf, asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const user = await findUserByUsername(db, username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      console.info('auth.login.failure');
      res.status(401).json({
        error: { code: 'AUTH_INVALID', message: 'Username atau password salah.' }
      });
      return;
    }

    await promisify(req.session.regenerate).call(req.session);
    req.session.userId = user.id;
    req.session.csrfToken = newToken();
    await promisify(req.session.save).call(req.session);

    console.info('auth.login.success');
    res.json({
      message: 'Login berhasil.',
      user: { id: user.id, username: user.username },
      csrfToken: req.session.csrfToken
    });
  }));

  router.post('/logout', requireCsrf, (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        res.status(500).json({
          error: { code: 'LOGOUT_FAILED', message: 'Gagal keluar dari sesi.' }
        });
        return;
      }
      res.clearCookie(config.cookieName, cookieOptions(config, false));
      console.info('auth.logout.success');
      res.json({ message: 'Anda telah keluar.' });
    });
  });

  return router;
}

module.exports = { createAuthRouter, cookieOptions };
