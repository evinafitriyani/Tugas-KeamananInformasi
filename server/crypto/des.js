'use strict';

const desjs = require('des.js');

const DesCbc = desjs.CBC.instantiate(desjs.DES);

function cryptDesCbc(input, key, iv, type) {
  if (!Buffer.isBuffer(key) || key.length !== 8) throw new Error('DES key harus 8 byte.');
  if (!Buffer.isBuffer(iv) || iv.length !== 8) throw new Error('DES IV harus 8 byte.');
  if (!Buffer.isBuffer(input)) throw new Error('DES input harus Buffer.');

  const cipher = DesCbc.create({
    type,
    key: Array.from(key),
    iv: Array.from(iv),
    padding: true
  });
  const first = cipher.update(Array.from(input));
  const last = cipher.final();
  return Buffer.from(first.concat(last));
}

function encryptDesCbc(input, key, iv) {
  return cryptDesCbc(input, key, iv, 'encrypt');
}

function decryptDesCbc(input, key, iv) {
  return cryptDesCbc(input, key, iv, 'decrypt');
}

module.exports = { encryptDesCbc, decryptDesCbc };
