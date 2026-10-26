'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  encrypt,
  verifyAndDecrypt,
  parseEnvelope,
  canonicalize,
  ALGORITHMS
} = require('../server/crypto');
const { encryptAesCbc } = require('../server/crypto/aes');
const { rc4 } = require('../server/crypto/rc4');
const { IntegrityError } = require('../server/errors');

const MASTER_KEY = Buffer.alloc(48, 21);

test('AES-256-CBC, DES-CBC, dan RC4 melakukan round-trip untuk berbagai ukuran', () => {
  for (const algorithm of ['AES', 'DES', 'RC4']) {
    for (const size of [1, 15, 16, 17, 1024, 65536]) {
      const plaintext = crypto.randomBytes(size);
      const envelope = encrypt(plaintext, algorithm, MASTER_KEY);
      const envelopeObject = JSON.parse(envelope.toString('utf8'));
      assert.equal(envelopeObject.version, 1);
      assert.equal(envelopeObject.algorithm, algorithm);
      assert.equal(envelopeObject.mode, ALGORITHMS[algorithm].mode);
      assert.equal(envelopeObject.kdf, 'HKDF-SHA256');
      assert.ok(envelopeObject.hmac);
      assert.ok(!envelope.toString('utf8').includes(plaintext.toString('base64')));
      const decrypted = verifyAndDecrypt(envelope, MASTER_KEY, { algorithm });
      assert.deepEqual(decrypted, plaintext);
    }
  }
});

test('envelope menolak field tambahan dan field yang hilang', () => {
  const envelope = JSON.parse(encrypt(Buffer.from('rahasia'), 'AES', MASTER_KEY).toString('utf8'));
  const extra = { ...envelope, unexpected: 'x' };
  assert.throws(() => verifyAndDecrypt(JSON.stringify(extra), MASTER_KEY), IntegrityError);

  const missing = { ...envelope };
  delete missing.iv;
  assert.throws(() => verifyAndDecrypt(JSON.stringify(missing), MASTER_KEY), IntegrityError);
});

test('tamper ciphertext ditolak oleh HMAC sebelum dekripsi', () => {
  const envelope = JSON.parse(encrypt(Buffer.from('dokumen penting'), 'AES', MASTER_KEY).toString('utf8'));
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  ciphertext[0] ^= 0xff;
  envelope.ciphertext = ciphertext.toString('base64');
  assert.throws(
    () => verifyAndDecrypt(JSON.stringify(envelope), MASTER_KEY),
    (error) => error instanceof IntegrityError && /HMAC/.test(error.message)
  );
});

test('tamper salt, algoritma, dan HMAC ditolak', () => {
  const original = JSON.parse(encrypt(Buffer.from('dokumen penting'), 'AES', MASTER_KEY).toString('utf8'));

  const saltTampered = { ...original, salt: crypto.randomBytes(32).toString('base64') };
  assert.throws(() => verifyAndDecrypt(JSON.stringify(saltTampered), MASTER_KEY), IntegrityError);

  const algorithmTampered = { ...original, algorithm: 'DES', mode: 'CBC' };
  assert.throws(() => verifyAndDecrypt(JSON.stringify(algorithmTampered), MASTER_KEY), IntegrityError);

  const macTampered = { ...original, hmac: Buffer.alloc(32).toString('base64') };
  assert.throws(() => verifyAndDecrypt(JSON.stringify(macTampered), MASTER_KEY), IntegrityError);
});

test('master key yang salah tidak dapat mendekripsi envelope', () => {
  const envelope = encrypt(Buffer.from('hanya pemilik kunci'), 'RC4', MASTER_KEY);
  assert.throws(
    () => verifyAndDecrypt(envelope, Buffer.alloc(48, 22)),
    (error) => error instanceof IntegrityError && /HMAC/.test(error.message)
  );
});

test('metadata hash/ukuran yang tidak cocok ditolak setelah HMAC valid', () => {
  const envelope = encrypt(Buffer.from('metadata check'), 'AES', MASTER_KEY);
  assert.throws(
    () => verifyAndDecrypt(envelope, MASTER_KEY, { sha256: '0'.repeat(64) }),
    IntegrityError
  );
  assert.throws(
    () => verifyAndDecrypt(envelope, MASTER_KEY, { size: 1 }),
    IntegrityError
  );
});

test('canonical JSON stabil terhadap urutan key', () => {
  assert.equal(
    canonicalize({ b: 2, a: { d: 4, c: 3 } }),
    '{"a":{"c":3,"d":4},"b":2}'
  );
});

test('RC4 cocok dengan vektor uji referensi', () => {
  const output = rc4(Buffer.from('Key', 'ascii'), Buffer.from('Plaintext', 'ascii'));
  assert.equal(output.toString('hex').toUpperCase(), 'BBF316E8D940AF0AD3');
});

test('AES-256-CBC cocok dengan blok pertama vektor NIST SP 800-38A', () => {
  const key = Buffer.from(
    '603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4',
    'hex'
  );
  const iv = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const plaintext = Buffer.from('6bc1bee22e409f96e93d7e117393172a', 'hex');
  const ciphertext = encryptAesCbc(plaintext, key, iv);
  assert.equal(ciphertext.subarray(0, 16).toString('hex'), 'f58c4c04d6e5f1ba779eabfb5f7bfbd6');
});

test('parseEnvelope menolak JSON rusak dan base64 tidak kanonis', () => {
  assert.throws(() => parseEnvelope('{not-json'), IntegrityError);
  const envelope = JSON.parse(encrypt(Buffer.from('base64'), 'AES', MASTER_KEY).toString('utf8'));
  envelope.salt = `${envelope.salt.slice(0, -4)}`;
  assert.throws(() => parseEnvelope(JSON.stringify(envelope)), IntegrityError);
});
