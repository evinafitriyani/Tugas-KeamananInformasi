'use strict';

const crypto = require('node:crypto');
const { encryptAesCbc, decryptAesCbc } = require('./aes');
const { encryptDesCbc, decryptDesCbc } = require('./des');
const { rc4 } = require('./rc4');
const {
  ALGORITHMS,
  SALT_LENGTH,
  algorithmConfig,
  deriveEncryptionKey,
  deriveMacKey
} = require('./keys');
const { IntegrityError } = require('../errors');

const ENVELOPE_VERSION = 1;
const KDF = 'HKDF-SHA256';
const HMAC_ALGORITHM = 'sha256';
const HMAC_LENGTH = 32;
const MAX_ENVELOPE_BYTES = 40 * 1024 * 1024;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const ENVELOPE_KEYS = new Set([
  'version',
  'algorithm',
  'mode',
  'kdf',
  'salt',
  'iv',
  'ciphertext',
  'plaintext_sha256',
  'plaintext_size',
  'hmac'
]);

function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error('Nilai tidak dapat diserialisasi secara kanonis.');
}

function strictBase64(value, field, expectedLength = null) {
  if (typeof value !== 'string' || !BASE64_RE.test(value)) {
    throw new IntegrityError(`Field ${field} bukan Base64 yang valid.`);
  }
  const buffer = Buffer.from(value, 'base64');
  if (buffer.toString('base64') !== value) {
    throw new IntegrityError(`Field ${field} bukan Base64 kanonis.`);
  }
  if (expectedLength !== null && buffer.length !== expectedLength) {
    throw new IntegrityError(`Panjang field ${field} tidak sesuai.`);
  }
  return buffer;
}

function cipherFor(algorithm, type, input, key, iv) {
  if (algorithm === 'AES') {
    return type === 'encrypt' ? encryptAesCbc(input, key, iv) : decryptAesCbc(input, key, iv);
  }
  if (algorithm === 'DES') {
    return type === 'encrypt' ? encryptDesCbc(input, key, iv) : decryptDesCbc(input, key, iv);
  }
  if (algorithm === 'RC4') {
    return rc4(key, input);
  }
  throw new IntegrityError('Algoritma tidak didukung.');
}

function macPayload(payload) {
  // Canonical MAC input: UTF-8 canonical JSON of every envelope field except
  // `hmac`, with object keys sorted lexicographically at every level. Because
  // the parser accepts only the exact known field set, this deterministically
  // authenticates version, algorithm, mode, kdf, salt, iv, ciphertext,
  // plaintext_sha256, and plaintext_size.
  const copy = {};
  for (const key of Object.keys(payload)) {
    if (key !== 'hmac') copy[key] = payload[key];
  }
  return Buffer.from(canonicalize(copy), 'utf8');
}

function computeMac(macKey, payload) {
  return crypto.createHmac(HMAC_ALGORITHM, macKey).update(macPayload(payload)).digest();
}

function encrypt(plaintext, algorithm, masterKey) {
  if (!Buffer.isBuffer(plaintext)) {
    throw new TypeError('Plaintext harus Buffer.');
  }
  const config = algorithmConfig(algorithm);
  if (plaintext.length === 0) {
    throw new TypeError('Plaintext tidak boleh kosong.');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = config.ivLength > 0 ? crypto.randomBytes(config.ivLength) : null;
  const encryptionKey = deriveEncryptionKey(masterKey, algorithm, salt);
  const macKey = deriveMacKey(masterKey, algorithm, salt);
  const ciphertext = cipherFor(algorithm, 'encrypt', plaintext, encryptionKey, iv);

  const payload = {
    version: ENVELOPE_VERSION,
    algorithm,
    mode: config.mode,
    kdf: KDF,
    salt: salt.toString('base64'),
    iv: iv ? iv.toString('base64') : null,
    ciphertext: ciphertext.toString('base64'),
    plaintext_sha256: crypto.createHash('sha256').update(plaintext).digest('hex'),
    plaintext_size: plaintext.length
  };
  const hmac = computeMac(macKey, payload);
  const envelope = { ...payload, hmac: hmac.toString('base64') };

  return Buffer.from(JSON.stringify(envelope), 'utf8');
}

function parseEnvelope(input, options = {}) {
  const maxBytes = options.maxBytes || MAX_ENVELOPE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError('Batas envelope tidak valid.');
  }

  let raw;
  try {
    raw = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  } catch {
    throw new IntegrityError('Envelope tidak dapat dibaca.');
  }
  if (raw.length > maxBytes) {
    throw new IntegrityError('Envelope melebihi ukuran maksimum.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new IntegrityError('Envelope tidak dapat dibaca.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new IntegrityError('Envelope harus berupa objek JSON.');
  }

  const keys = Object.keys(parsed);
  if (keys.length !== ENVELOPE_KEYS.size || keys.some((key) => !ENVELOPE_KEYS.has(key))) {
    throw new IntegrityError('Envelope memiliki field yang tidak dikenal atau tidak lengkap.');
  }

  if (parsed.version !== ENVELOPE_VERSION) {
    throw new IntegrityError('Versi envelope tidak didukung.');
  }
  if (!Object.hasOwn(ALGORITHMS, parsed.algorithm)) {
    throw new IntegrityError('Algoritma envelope tidak didukung.');
  }

  const config = ALGORITHMS[parsed.algorithm];
  if (parsed.mode !== config.mode) {
    throw new IntegrityError('Mode envelope tidak sesuai dengan algoritma.');
  }
  if (parsed.kdf !== KDF) {
    throw new IntegrityError('KDF envelope tidak didukung.');
  }
  if (!Number.isSafeInteger(parsed.plaintext_size) || parsed.plaintext_size <= 0) {
    throw new IntegrityError('Ukuran plaintext pada envelope tidak valid.');
  }
  if (parsed.plaintext_size > maxBytes) {
    throw new IntegrityError('Ukuran plaintext pada envelope melebihi batas.');
  }
  if (typeof parsed.plaintext_sha256 !== 'string' || !SHA256_HEX_RE.test(parsed.plaintext_sha256)) {
    throw new IntegrityError('Hash plaintext pada envelope tidak valid.');
  }

  const salt = strictBase64(parsed.salt, 'salt', SALT_LENGTH);
  const hmac = strictBase64(parsed.hmac, 'hmac', HMAC_LENGTH);
  const ciphertext = strictBase64(parsed.ciphertext, 'ciphertext');
  if (ciphertext.length === 0) {
    throw new IntegrityError('Ciphertext kosong tidak valid.');
  }

  let iv = null;
  if (config.ivLength > 0) {
    iv = strictBase64(parsed.iv, 'iv', config.ivLength);
  } else if (parsed.iv !== null) {
    throw new IntegrityError('IV harus null untuk algoritma stream.');
  }

  if (config.mode === 'CBC' && ciphertext.length % config.ivLength !== 0) {
    throw new IntegrityError('Panjang ciphertext CBC tidak valid.');
  }
  if (config.mode === 'CBC' && ciphertext.length < config.ivLength) {
    throw new IntegrityError('Ciphertext CBC terlalu pendek.');
  }

  return { parsed, salt, iv, ciphertext, hmac, config };
}

function verifyAndDecrypt(input, masterKey, expected = {}) {
  const { parsed, salt, iv, ciphertext, hmac } = parseEnvelope(input);

  const macKey = deriveMacKey(masterKey, parsed.algorithm, salt);
  const expectedMac = computeMac(macKey, parsed);
  if (expectedMac.length !== hmac.length || !crypto.timingSafeEqual(expectedMac, hmac)) {
    throw new IntegrityError('HMAC tidak cocok. File mungkin telah dimodifikasi.');
  }

  if (expected.algorithm && parsed.algorithm !== expected.algorithm) {
    throw new IntegrityError('Algoritma metadata tidak cocok dengan envelope.');
  }
  if (expected.mode && parsed.mode !== expected.mode) {
    throw new IntegrityError('Mode metadata tidak cocok dengan envelope.');
  }
  if (expected.version && parsed.version !== expected.version) {
    throw new IntegrityError('Versi metadata tidak cocok dengan envelope.');
  }
  if (expected.sha256 && parsed.plaintext_sha256 !== expected.sha256) {
    throw new IntegrityError('Hash metadata tidak cocok dengan envelope.');
  }
  if (expected.size && parsed.plaintext_size !== expected.size) {
    throw new IntegrityError('Ukuran metadata tidak cocok dengan envelope.');
  }

  const encryptionKey = deriveEncryptionKey(masterKey, parsed.algorithm, salt);
  let plaintext;
  try {
    plaintext = cipherFor(parsed.algorithm, 'decrypt', ciphertext, encryptionKey, iv);
  } catch {
    throw new IntegrityError('Dekripsi gagal setelah verifikasi integritas.');
  }

  if (plaintext.length !== parsed.plaintext_size) {
    throw new IntegrityError('Ukuran plaintext hasil dekripsi tidak sesuai.');
  }
  const digest = crypto.createHash('sha256').update(plaintext).digest('hex');
  if (digest !== parsed.plaintext_sha256) {
    throw new IntegrityError('Hash plaintext hasil dekripsi tidak sesuai.');
  }

  return plaintext;
}

function envelopeInfo(input) {
  const { parsed } = parseEnvelope(input);
  return {
    version: parsed.version,
    algorithm: parsed.algorithm,
    mode: parsed.mode,
    kdf: parsed.kdf,
    plaintextSize: parsed.plaintext_size,
    plaintextSha256: parsed.plaintext_sha256
  };
}

module.exports = {
  ENVELOPE_VERSION,
  KDF,
  HMAC_ALGORITHM,
  HMAC_LENGTH,
  MAX_ENVELOPE_BYTES,
  ALGORITHMS,
  canonicalize,
  computeMac,
  encrypt,
  parseEnvelope,
  verifyAndDecrypt,
  envelopeInfo
};
