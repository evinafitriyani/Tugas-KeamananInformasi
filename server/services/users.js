'use strict';

const crypto = require('node:crypto');
const { run, get } = require('../db');
const { ValidationError } = require('../errors');

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

function validateUsername(username) {
  const normalized = normalizeUsername(username);
  if (!USERNAME_RE.test(normalized)) {
    throw new ValidationError(
      'Username harus 3-32 karakter dan hanya berisi huruf, angka, titik, garis bawah, atau tanda hubung.'
    );
  }
  return normalized;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new ValidationError(`Password harus ${PASSWORD_MIN}-${PASSWORD_MAX} karakter.`);
  }
  return password;
}

function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return [
    'scrypt',
    '1',
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64'),
    derived.toString('base64')
  ].join('$');
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== '1') return false;

  const [, , n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;

  try {
    const actual = crypto.scryptSync(password, salt, KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function createUser(db, username, password) {
  const normalized = validateUsername(username);
  validatePassword(password);
  const passwordHash = hashPassword(password);
  const createdAt = new Date().toISOString();
  try {
    const result = await run(
      db,
      'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
      [normalized, passwordHash, createdAt]
    );
    return { id: result.lastID, username: normalized, created_at: createdAt };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT' || /UNIQUE/i.test(error.message)) {
      const conflict = new Error('Username sudah digunakan.');
      conflict.status = 409;
      conflict.code = 'USERNAME_CONFLICT';
      throw conflict;
    }
    throw error;
  }
}

async function findUserByUsername(db, username) {
  return get(
    db,
    'SELECT id, username, password_hash, created_at FROM users WHERE username = ?',
    [normalizeUsername(username)]
  );
}

async function findUserById(db, id) {
  return get(db, 'SELECT id, username, created_at FROM users WHERE id = ?', [id]);
}

module.exports = {
  normalizeUsername,
  validateUsername,
  validatePassword,
  hashPassword,
  verifyPassword,
  createUser,
  findUserByUsername,
  findUserById
};
