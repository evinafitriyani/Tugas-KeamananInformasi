'use strict';

const crypto = require('node:crypto');

const ALGORITHMS = {
  AES: {
    mode: 'CBC',
    keyLength: 32,
    ivLength: 16,
    info: 'campusvault:v1:aes'
  },
  DES: {
    mode: 'CBC',
    keyLength: 8,
    ivLength: 8,
    info: 'campusvault:v1:des'
  },
  RC4: {
    mode: 'STREAM',
    keyLength: 32,
    ivLength: 0,
    info: 'campusvault:v1:rc4'
  }
};

const MAC_KEY_LENGTH = 32;
const SALT_LENGTH = 32;

function algorithmConfig(algorithm) {
  const config = ALGORITHMS[algorithm];
  if (!config) {
    throw new Error('Algoritma tidak didukung.');
  }
  return config;
}

function deriveKey(masterKey, algorithm, salt, purpose, length) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length < 32) {
    throw new Error('Master key tidak valid.');
  }
  if (!Buffer.isBuffer(salt) || salt.length !== SALT_LENGTH) {
    throw new Error('Salt harus 32 byte.');
  }

  const config = algorithmConfig(algorithm);
  const info = `${config.info}:${purpose}`;
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, salt, info, length));
}

function deriveEncryptionKey(masterKey, algorithm, salt) {
  const { keyLength } = algorithmConfig(algorithm);
  return deriveKey(masterKey, algorithm, salt, 'enc', keyLength);
}

function deriveMacKey(masterKey, algorithm, salt) {
  return deriveKey(masterKey, algorithm, salt, 'mac', MAC_KEY_LENGTH);
}

module.exports = {
  ALGORITHMS,
  SALT_LENGTH,
  MAC_KEY_LENGTH,
  algorithmConfig,
  deriveEncryptionKey,
  deriveMacKey
};
