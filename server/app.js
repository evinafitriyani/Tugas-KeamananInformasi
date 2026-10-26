'use strict';

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { SqliteSessionStore } = require('./session-store');
const { ensureCsrfToken } = require('./middleware/csrf');
const { createAuthRouter, cookieOptions } = require('./routes/auth');
const { createFilesRouter } = require('./routes/files');
const { createBenchmarkRouter } = require('./routes/benchmark');
const { notFoundApi, errorHandler } = require('./middleware/error');

function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  const store = new SqliteSessionStore(db, config.sessionTtlMs);
  app.use(session({
    name: config.cookieName,
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: cookieOptions(config)
  }));

  const apiLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.apiRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan. Coba lagi nanti.' }
    }
  });
  const authLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'AUTH_RATE_LIMITED', message: 'Terlalu banyak percobaan autentikasi.' }
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'CampusVault' });
  });

  app.use('/api', apiLimiter);
  app.use('/api', ensureCsrfToken);
  app.use('/api/auth', createAuthRouter({ db, config, authLimiter }));
  app.use('/api/files', createFilesRouter({ db, config }));
  app.use('/api/benchmark', createBenchmarkRouter({ config }));

  app.use(express.static(config.publicDir, {
    index: 'index.html',
    etag: true,
    maxAge: config.isProduction ? '1h' : 0
  }));

  app.use(notFoundApi);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
