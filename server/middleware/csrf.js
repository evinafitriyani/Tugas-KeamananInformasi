'use strict';

const crypto = require('node:crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = newToken();
  }
  next();
}

function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const provided = req.get('x-csrf-token');
  if (!tokensMatch(req.session.csrfToken, provided)) {
    res.status(403).json({
      error: {
        code: 'CSRF_FAILED',
        message: 'Permintaan ditolak karena token keamanan tidak valid.'
      }
    });
    return;
  }

  next();
}

module.exports = { ensureCsrfToken, requireCsrf, newToken };
