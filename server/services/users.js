'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { run, get } = require('../db');
const { ValidationError } = require('../errors');

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const scrypt = promisify(crypto.scrypt);

// A syntactically valid but unusable hash. It keeps login timing similar when
// the username does not exist, without revealing whether an account is present.
const DUMMY_PASSWORD_HASH = [
  'scrypt',
  '1',
  String(SCRYPT_N),
  String(SCRYPT_R),
  String(SCRYPT_P),
  crypto.randomBytes(SALT_LENGTH).toString('base64'),
  crypto.randomBytes(KEY_LENGTH).toString('base64')
].join('$');

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

async function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
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

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > PASSWORD_MAX || typeof stored !== 'string') {
    return false;
  }
  const parts = stored.split('$');
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== '1') return false;

  const [, , n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;

  try {
    const actual = await scrypt(password, salt, KEY_LENGTH, {
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
  const passwordHash = await hashPassword(password);
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

async function authenticateUser(db, username, password) {
  const user = await findUserByUsername(db, username);
  const stored = user ? user.password_hash : DUMMY_PASSWORD_HASH;
  const valid = await verifyPassword(password, stored);
  return valid && user ? user : null;
}

module.exports = {
  normalizeUsername,
  validateUsername,
  validatePassword,
  hashPassword,
  verifyPassword,
  createUser,
  findUserByUsername,
  findUserById,
  authenticateUser,
  PASSWORD_MIN,
  PASSWORD_MAX
};
