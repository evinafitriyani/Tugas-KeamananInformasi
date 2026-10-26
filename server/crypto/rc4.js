'use strict';

function rc4(key, input) {
  if (!Buffer.isBuffer(key) || key.length === 0 || key.length > 256) {
    throw new Error('RC4 key harus 1-256 byte.');
  }
  if (!Buffer.isBuffer(input)) {
    throw new Error('RC4 input harus Buffer.');
  }

  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) s[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
  }

  const output = Buffer.alloc(input.length);
  let i = 0;
  j = 0;
  for (let n = 0; n < input.length; n += 1) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
    const k = s[(s[i] + s[j]) & 0xff];
    output[n] = input[n] ^ k;
  }

  return output;
}

module.exports = { rc4 };
