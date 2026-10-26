'use strict';

const crypto = require('node:crypto');

function encryptAesCbc(input, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(input), cipher.final()]);
}

function decryptAesCbc(input, key, iv) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(input), decipher.final()]);
}

module.exports = { encryptAesCbc, decryptAesCbc };
