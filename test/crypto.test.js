'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  encrypt,
  verifyAndDecrypt,
  parseEnvelope,
  canonicalize,
  MAX_ENVELOPE_BYTES,
  ALGORITHMS
} = require('../server/crypto');
const { encryptAesCbc } = require('../server/crypto/aes');
const { encryptDesCbc, decryptDesCbc } = require('../server/crypto/des');
const { rc4 } = require('../server/crypto/rc4');
const { deriveEncryptionKey, deriveMacKey, SALT_LENGTH } = require('../server/crypto/keys');
const { IntegrityError } = require('../server/errors');

const MASTER_KEY = crypto.randomBytes(48);
const WRONG_MASTER_KEY = crypto.randomBytes(48);

function makeEnvelope(algorithm = 'AES', plaintext = Buffer.from('dokumen penting')) {
  return JSON.parse(encrypt(plaintext, algorithm, MASTER_KEY).toString('utf8'));
}

function expectIntegrityFailure(envelope, message) {
  assert.throws(
    () => verifyAndDecrypt(JSON.stringify(envelope), MASTER_KEY),
    (error) => error instanceof IntegrityError && (!message || message.test(error.message))
  );
}

test('AES-256-CBC, DES-CBC, dan RC4 melakukan round-trip untuk berbagai ukuran', () => {
  for (const algorithm of ['AES', 'DES', 'RC4']) {
    for (const size of [1, 7, 8, 15, 16, 17, 1024, 65536]) {
      const plaintext = crypto.randomBytes(size);
      const envelope = encrypt(plaintext, algorithm, MASTER_KEY);
      const envelopeObject = JSON.parse(envelope.toString('utf8'));
      assert.equal(envelopeObject.version, 1);
      assert.equal(envelopeObject.algorithm, algorithm);
      assert.equal(envelopeObject.mode, ALGORITHMS[algorithm].mode);
      assert.equal(envelopeObject.kdf, 'HKDF-SHA256');
      assert.ok(envelopeObject.hmac);
      assert.ok(!envelope.toString('utf8').includes(plaintext.toString('base64')));
      const decrypted = verifyAndDecrypt(envelope, MASTER_KEY, {
        algorithm,
        mode: ALGORITHMS[algorithm].mode,
        version: 1,
        sha256: envelopeObject.plaintext_sha256,
        size: plaintext.length
      });
      assert.deepEqual(decrypted, plaintext);
    }
  }
});

test('plaintext kosong ditolak secara eksplisit', () => {
  for (const algorithm of ['AES', 'DES', 'RC4']) {
    assert.throws(() => encrypt(Buffer.alloc(0), algorithm, MASTER_KEY), /kosong/i);
  }
});

test('enkripsi berulang menghasilkan salt, IV, dan ciphertext berbeda', () => {
  for (const algorithm of ['AES', 'DES', 'RC4']) {
    const plaintext = Buffer.from('konten yang sama');
    const first = makeEnvelope(algorithm, plaintext);
    const second = makeEnvelope(algorithm, plaintext);
    assert.notEqual(first.salt, second.salt);
    assert.notEqual(first.ciphertext, second.ciphertext);
    if (ALGORITHMS[algorithm].ivLength > 0) {
      assert.notEqual(first.iv, second.iv);
    } else {
      assert.equal(first.iv, null);
    }
  }
});

test('semua fixture benchmark dapat dipulihkan dengan ketiga algoritma', () => {
  const fixturesDir = path.join(__dirname, '..', 'benchmark', 'fixtures');
  const manifest = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'manifest.json'), 'utf8'));
  for (const fixture of manifest.fixtures) {
    const plaintext = fs.readFileSync(path.join(fixturesDir, fixture.file));
    for (const algorithm of ['AES', 'DES', 'RC4']) {
      const envelope = encrypt(plaintext, algorithm, MASTER_KEY);
      const restored = verifyAndDecrypt(envelope, MASTER_KEY, {
        algorithm,
        sha256: fixture.sha256,
        size: fixture.bytes
      });
      assert.deepEqual(restored, plaintext, `${fixture.id}/${algorithm}`);
    }
  }
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

test('DES-CBC memakai single DES sesuai vektor FIPS untuk blok pertama', () => {
  const key = Buffer.from('0123456789abcdef', 'hex');
  const iv = Buffer.alloc(8);
  const plaintext = Buffer.from('4e6f772069732074', 'hex');
  const ciphertext = encryptDesCbc(plaintext, key, iv);
  assert.equal(ciphertext.subarray(0, 8).toString('hex'), '3fa40e8a984d4815');
  assert.deepEqual(decryptDesCbc(ciphertext, key, iv), plaintext);
});

test('RC4 cocok dengan vektor uji referensi', () => {
  const output = rc4(Buffer.from('Key', 'ascii'), Buffer.from('Plaintext', 'ascii'));
  assert.equal(output.toString('hex').toUpperCase(), 'BBF316E8D940AF0AD3');
});

test('kunci enkripsi dan MAC diturunkan terpisah serta deterministik per salt', () => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  for (const algorithm of ['AES', 'DES', 'RC4']) {
    const encryptionKey = deriveEncryptionKey(MASTER_KEY, algorithm, salt);
    const macKey = deriveMacKey(MASTER_KEY, algorithm, salt);
    assert.equal(encryptionKey.length, ALGORITHMS[algorithm].keyLength);
    assert.equal(macKey.length, 32);
    assert.notDeepEqual(encryptionKey, macKey.subarray(0, encryptionKey.length));
    assert.deepEqual(deriveEncryptionKey(MASTER_KEY, algorithm, salt), encryptionKey);
    assert.notDeepEqual(
      deriveEncryptionKey(MASTER_KEY, algorithm, crypto.randomBytes(SALT_LENGTH)),
      encryptionKey
    );
  }
});

test('envelope menolak field tambahan, field hilang, versi, algoritma, dan mode tidak dikenal', () => {
  const envelope = makeEnvelope();
  expectIntegrityFailure({ ...envelope, unexpected: 'x' });

  const missing = { ...envelope };
  delete missing.iv;
  expectIntegrityFailure(missing);

  expectIntegrityFailure({ ...envelope, version: 2 });
  expectIntegrityFailure({ ...envelope, algorithm: 'UNKNOWN' });
  expectIntegrityFailure({ ...envelope, mode: 'STREAM' });
  expectIntegrityFailure({ ...envelope, kdf: 'PBKDF2' });
});

test('setiap field yang diautentikasi ditolak saat diubah', () => {
  const envelope = makeEnvelope('AES');
  expectIntegrityFailure({ ...envelope, salt: crypto.randomBytes(32).toString('base64') });
  expectIntegrityFailure({ ...envelope, iv: crypto.randomBytes(16).toString('base64') });
  expectIntegrityFailure({
    ...envelope,
    ciphertext: Buffer.from('X'.repeat(32)).toString('base64')
  });
  expectIntegrityFailure({ ...envelope, hmac: crypto.randomBytes(32).toString('base64') });
  expectIntegrityFailure({ ...envelope, plaintext_sha256: '0'.repeat(64) });
  expectIntegrityFailure({ ...envelope, plaintext_size: envelope.plaintext_size + 1 });
  expectIntegrityFailure({ ...envelope, algorithm: 'DES' });
});

test('tamper ciphertext ditolak oleh HMAC sebelum dekripsi', () => {
  const envelope = makeEnvelope('AES', Buffer.from('rahasia yang tidak boleh bocor'));
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  ciphertext[0] ^= 0xff;
  envelope.ciphertext = ciphertext.toString('base64');
  assert.throws(
    () => verifyAndDecrypt(JSON.stringify(envelope), MASTER_KEY),
    (error) => error instanceof IntegrityError &&
      /HMAC/.test(error.message) &&
      !error.message.includes('rahasia yang tidak boleh bocor')
  );
});

test('Base64 rusak, ciphertext terpotong, dan tipe field salah ditolak', () => {
  const envelope = makeEnvelope();
  assert.throws(() => parseEnvelope('{not-json'), IntegrityError);
  assert.throws(() => parseEnvelope('[]'), IntegrityError);
  assert.throws(() => parseEnvelope('null'), IntegrityError);

  expectIntegrityFailure({ ...envelope, salt: `${envelope.salt.slice(0, -4)}` });
  expectIntegrityFailure({ ...envelope, hmac: '!!!' });
  expectIntegrityFailure({ ...envelope, ciphertext: Buffer.concat([Buffer.alloc(3)]).toString('base64') });
  expectIntegrityFailure({ ...envelope, iv: null });
  expectIntegrityFailure({ ...envelope, version: '1' });

  const rc4Envelope = makeEnvelope('RC4');
  expectIntegrityFailure({ ...rc4Envelope, iv: crypto.randomBytes(8).toString('base64') });
});

test('envelope melebihi batas ukuran ditolak sebelum parsing', () => {
  const envelope = encrypt(Buffer.from('batas'), 'AES', MASTER_KEY);
  assert.throws(() => parseEnvelope(envelope, { maxBytes: 10 }), /maksimum/i);
  assert.ok(MAX_ENVELOPE_BYTES >= 25 * 1024 * 1024);
});

test('master key salah dan metadata yang tidak cocok ditolak', () => {
  const envelope = encrypt(Buffer.from('hanya pemilik kunci'), 'RC4', MASTER_KEY);
  assert.throws(
    () => verifyAndDecrypt(envelope, WRONG_MASTER_KEY),
    (error) => error instanceof IntegrityError && /HMAC/.test(error.message)
  );

  assert.throws(
    () => verifyAndDecrypt(envelope, MASTER_KEY, { sha256: '0'.repeat(64) }),
    IntegrityError
  );
  assert.throws(
    () => verifyAndDecrypt(envelope, MASTER_KEY, { size: 1 }),
    IntegrityError
  );
  assert.throws(
    () => verifyAndDecrypt(envelope, MASTER_KEY, { algorithm: 'AES' }),
    IntegrityError
  );
});

test('canonical JSON stabil terhadap urutan key', () => {
  assert.equal(
    canonicalize({ b: 2, a: { d: 4, c: 3 } }),
    '{"a":{"c":3,"d":4},"b":2}'
  );
});
