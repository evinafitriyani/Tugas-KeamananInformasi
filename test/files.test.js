'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const request = require('supertest');
const { get, all, exec } = require('../server/db');
const { createFile } = require('../server/services/files');
const {
  TEST_PASSWORD,
  createTestContext,
  register,
  login,
  upload,
  csvFixture,
  pdfFixture,
  pngFixture,
  jpgFixture,
  docxFixture,
  xlsxFixture,
  pptxFixture,
  mp4Fixture,
  webmFixture
} = require('./helpers');

function binaryParser(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

function download(agent, fileId, kind = 'download') {
  return agent
    .get(`/api/files/${fileId}/${kind}`)
    .buffer(true)
    .parse((response, callback) => {
      const contentType = response.headers['content-type'] || '';
      const isAttachment = Boolean(response.headers['content-disposition']);
      if (contentType.includes('application/json') && !isAttachment) {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          try {
            callback(null, JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (error) {
            callback(error);
          }
        });
        return;
      }
      binaryParser(response, callback);
    });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function ownerWithFile(ctx, username = 'pemilik', algorithm = 'AES') {
  await register(ctx.agent, username);
  const session = await login(ctx.agent, username);
  const file = csvFixture();
  const response = await upload(ctx.agent, session.csrf, file, algorithm);
  assert.equal(response.status, 201);
  return { csrf: session.csrf, file, id: response.body.file.id };
}

async function storageEntries(ctx) {
  try {
    return await fs.readdir(ctx.config.storageDir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

test('pemilik dapat mengunggah, melihat, mengunduh plaintext/ciphertext, dan menghapus', async () => {
  const ctx = await createTestContext();
  try {
    const { csrf, file, id } = await ownerWithFile(ctx);

    const row = await get(
      ctx.db,
      'SELECT storage_filename, original_sha256, original_size_bytes FROM files WHERE id = ?',
      [id]
    );
    assert.equal(row.original_sha256, sha256(file.buffer));
    assert.equal(row.original_size_bytes, file.buffer.length);
    assert.match(row.storage_filename, /^[a-f0-9]{48}\.json$/);
    assert.notEqual(row.storage_filename, file.filename);
    const storedPath = path.join(ctx.config.storageDir, row.storage_filename);
    await fs.access(storedPath);

    const list = await ctx.agent.get('/api/files').expect(200);
    assert.equal(list.body.files.length, 1);
    assert.equal(list.body.files[0].id, id);
    assert.equal(list.body.files[0].algorithm, 'AES');
    assert.equal(list.body.files[0].original_filename, file.filename);
    for (const forbidden of [
      'storage_filename', 'owner_id', 'original_sha256', 'hmac', 'salt', 'iv'
    ]) {
      assert.equal(Object.hasOwn(list.body.files[0], forbidden), false, forbidden);
    }

    const plaintext = await download(ctx.agent, id);
    assert.equal(plaintext.status, 200);
    assert.deepEqual(plaintext.body, file.buffer);
    assert.equal(sha256(plaintext.body), row.original_sha256);
    assert.equal(plaintext.body.length, row.original_size_bytes);
    assert.match(plaintext.headers['content-type'], /text\/csv/);
    assert.match(plaintext.headers['content-disposition'], /attachment/);
    assert.match(plaintext.headers['content-disposition'], /dummy\.csv/);

    const ciphertext = await download(ctx.agent, id, 'ciphertext');
    assert.equal(ciphertext.status, 200);
    const envelope = JSON.parse(ciphertext.body.toString('utf8'));
    assert.equal(envelope.algorithm, 'AES');
    assert.equal(envelope.version, 1);
    assert.ok(envelope.ciphertext);
    assert.equal(ciphertext.body.includes(file.buffer), false);

    const deletion = await ctx.agent
      .delete(`/api/files/${id}`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    assert.match(deletion.body.message, /dihapus/i);
    await assert.rejects(fs.access(storedPath), { code: 'ENOENT' });
    const after = await ctx.agent.get('/api/files').expect(200);
    assert.equal(after.body.files.length, 0);
    assert.equal(await get(ctx.db, 'SELECT id FROM files WHERE id = ?', [id]), undefined);
  } finally {
    await ctx.close();
  }
});

test('user lain tidak dapat melihat, mengunduh, atau menghapus file (owner-scoped IDOR)', async () => {
  const ctx = await createTestContext();
  try {
    const owner = await ownerWithFile(ctx, 'pemilik_a');
    const agentB = request.agent(ctx.app);
    await register(agentB, 'pemilik_b');
    const sessionB = await login(agentB, 'pemilik_b');

    const listB = await agentB.get('/api/files').expect(200);
    assert.equal(listB.body.files.length, 0);

    const plaintext = await download(agentB, owner.id);
    assert.equal(plaintext.status, 404);
    const ciphertext = await download(agentB, owner.id, 'ciphertext');
    assert.equal(ciphertext.status, 404);
    const deletion = await agentB
      .delete(`/api/files/${owner.id}`)
      .set('X-CSRF-Token', sessionB.csrf);
    assert.equal(deletion.status, 404);

    const listA = await ctx.agent.get('/api/files').expect(200);
    assert.equal(listA.body.files.length, 1);
  } finally {
    await ctx.close();
  }
});

test('username di body/query tidak dapat mengganti kepemilikan', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'pemilik_a');
    await login(ctx.agent, 'pemilik_a');
    const agentB = request.agent(ctx.app);
    await register(agentB, 'pemilik_b');
    const sessionB = await login(agentB, 'pemilik_b');

    const file = csvFixture();
    const uploaded = await agentB
      .post('/api/files?username=pemilik_a')
      .set('X-CSRF-Token', sessionB.csrf)
      .field('algorithm', 'AES')
      .field('username', 'pemilik_a')
      .attach('file', file.buffer, { filename: file.filename, contentType: file.mime });
    assert.equal(uploaded.status, 201);

    const listA = await ctx.agent.get('/api/files').expect(200);
    assert.equal(listA.body.files.length, 0);
    const listB = await agentB.get('/api/files').expect(200);
    assert.equal(listB.body.files.length, 1);

    const downloadByA = await download(ctx.agent, uploaded.body.file.id);
    assert.equal(downloadByA.status, 404);
  } finally {
    await ctx.close();
  }
});

test('validasi ekstensi, MIME, signature, file kosong, CSRF, dan algoritma', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'validator');
    const session = await login(ctx.agent, 'validator');

    const unsupported = await ctx.agent
      .post('/api/files')
      .set('X-CSRF-Token', session.csrf)
      .field('algorithm', 'AES')
      .attach('file', Buffer.from('hello'), { filename: 'dokumen.txt', contentType: 'text/plain' });
    assert.equal(unsupported.status, 415);

    const mimeMismatch = await ctx.agent
      .post('/api/files')
      .set('X-CSRF-Token', session.csrf)
      .field('algorithm', 'AES')
      .attach('file', pngFixture().buffer, { filename: 'gambar.png', contentType: 'text/plain' });
    assert.equal(mimeMismatch.status, 415);

    const signatureMismatch = await ctx.agent
      .post('/api/files')
      .set('X-CSRF-Token', session.csrf)
      .field('algorithm', 'AES')
      .attach('file', Buffer.from('bukan pdf'), { filename: 'palsu.pdf', contentType: 'application/pdf' });
    assert.equal(signatureMismatch.status, 415);

    const empty = await ctx.agent
      .post('/api/files')
      .set('X-CSRF-Token', session.csrf)
      .field('algorithm', 'AES')
      .attach('file', Buffer.alloc(0), { filename: 'kosong.csv', contentType: 'text/csv' });
    assert.equal(empty.status, 400);

    const invalidAlgorithm = await ctx.agent
      .post('/api/files')
      .set('X-CSRF-Token', session.csrf)
      .field('algorithm', '3DES')
      .attach('file', csvFixture().buffer, { filename: 'data.csv', contentType: 'text/csv' });
    assert.equal(invalidAlgorithm.status, 400);
    assert.equal((await ctx.agent.get('/api/files')).body.files.length, 0);
    assert.deepEqual(await storageEntries(ctx), []);

    const noCsrf = await ctx.agent
      .post('/api/files')
      .field('algorithm', 'AES')
      .attach('file', csvFixture().buffer, { filename: 'data.csv', contentType: 'text/csv' });
    assert.equal(noCsrf.status, 403);
  } finally {
    await ctx.close();
  }
});

test('batas ukuran upload dikonfigurasi dan ditegakkan', async () => {
  const ctx = await createTestContext({ MAX_UPLOAD_BYTES: '10' });
  try {
    await register(ctx.agent, 'kecil');
    const session = await login(ctx.agent, 'kecil');
    const response = await ctx.agent
      .post('/api/files')
      .set('X-CSRF-Token', session.csrf)
      .field('algorithm', 'AES')
      .attach('file', Buffer.from('12345678901'), { filename: 'data.csv', contentType: 'text/csv' });
    assert.equal(response.status, 413);
    assert.equal(response.body.error.code, 'FILE_TOO_LARGE');
    assert.deepEqual(await storageEntries(ctx), []);
  } finally {
    await ctx.close();
  }
});

test('semua format dan algoritma yang diizinkan dapat diunggah lalu dipulihkan byte-identik', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'format_tester');
    const session = await login(ctx.agent, 'format_tester');
    const jpeg = { ...jpgFixture(), filename: 'dummy.jpeg' };
    const fixtures = [
      csvFixture(),
      pdfFixture(),
      pngFixture(),
      jpgFixture(),
      jpeg,
      docxFixture(),
      xlsxFixture(),
      pptxFixture(),
      mp4Fixture(),
      webmFixture()
    ];
    const algorithms = ['AES', 'DES', 'RC4'];

    for (const [index, fixture] of fixtures.entries()) {
      const algorithm = algorithms[index % algorithms.length];
      const uploaded = await upload(ctx.agent, session.csrf, fixture, algorithm);
      assert.equal(uploaded.status, 201, `${fixture.filename}/${algorithm}`);
      assert.equal(uploaded.body.file.algorithm, algorithm);
      const downloaded = await download(ctx.agent, uploaded.body.file.id);
      assert.equal(downloaded.status, 200);
      assert.deepEqual(downloaded.body, fixture.buffer, `${fixture.filename}/${algorithm}`);
      assert.equal(sha256(downloaded.body), sha256(fixture.buffer));
    }

    const entries = await storageEntries(ctx);
    assert.equal(entries.length, fixtures.length);
    assert.equal(entries.every((name) => /^[a-f0-9]{48}\.json$/.test(name)), true);
  } finally {
    await ctx.close();
  }
});

test('nama file berbahaya dan nama duplikat tidak menimpa atau keluar dari storage', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'nama_file');
    const session = await login(ctx.agent, 'nama_file');

    const malicious = {
      ...csvFixture(),
      filename: '..\\..\\<img src=x onerror=alert(1)>.csv'
    };
    const uploaded = await upload(ctx.agent, session.csrf, malicious);
    assert.equal(uploaded.status, 201);
    const row = await get(
      ctx.db,
      'SELECT original_filename, storage_filename FROM files WHERE id = ?',
      [uploaded.body.file.id]
    );
    assert.match(row.storage_filename, /^[a-f0-9]{48}\.json$/);
    assert.equal(row.original_filename.includes('..'), false);
    assert.equal(row.original_filename.includes('\\'), false);
    await fs.access(path.join(ctx.config.storageDir, row.storage_filename));

    const duplicateA = await upload(ctx.agent, session.csrf, csvFixture());
    const duplicateB = await upload(ctx.agent, session.csrf, csvFixture());
    assert.equal(duplicateA.status, 201);
    assert.equal(duplicateB.status, 201);
    assert.notEqual(duplicateA.body.file.id, duplicateB.body.file.id);
    const rows = await all(
      ctx.db,
      'SELECT storage_filename FROM files WHERE id IN (?, ?)',
      [duplicateA.body.file.id, duplicateB.body.file.id]
    );
    assert.equal(new Set(rows.map((item) => item.storage_filename)).size, 2);
    assert.deepEqual((await download(ctx.agent, duplicateA.body.file.id)).body, csvFixture().buffer);
    assert.deepEqual((await download(ctx.agent, duplicateB.body.file.id)).body, csvFixture().buffer);
  } finally {
    await ctx.close();
  }
});

test('ciphertext yang dimodifikasi atau metadata yang tidak cocok ditolak (422)', async () => {
  const ctx = await createTestContext();
  try {
    const { id } = await ownerWithFile(ctx, 'integritas');
    const row = await get(ctx.db, 'SELECT storage_filename FROM files WHERE id = ?', [id]);
    const storedPath = path.join(ctx.config.storageDir, row.storage_filename);
    const envelope = JSON.parse(await fs.readFile(storedPath, 'utf8'));
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    ciphertext[0] ^= 0xff;
    envelope.ciphertext = ciphertext.toString('base64');
    await fs.writeFile(storedPath, JSON.stringify(envelope));

    const response = await download(ctx.agent, id);
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'INTEGRITY_CHECK_FAILED');
    assert.equal(Object.hasOwn(response.body, 'plaintext'), false);

    await exec(ctx.db, 'UPDATE files SET algorithm = ? WHERE id = ?', ['DES', id]);
    const metadataMismatch = await download(ctx.agent, id);
    assert.equal(metadataMismatch.status, 422);
    assert.equal(metadataMismatch.body.error.code, 'INTEGRITY_CHECK_FAILED');
  } finally {
    await ctx.close();
  }
});

test('file fisik hilang ditangani aman saat unduh dan hapus', async () => {
  const ctx = await createTestContext();
  try {
    const { csrf, id } = await ownerWithFile(ctx, 'fisik');
    const row = await get(ctx.db, 'SELECT storage_filename FROM files WHERE id = ?', [id]);
    await fs.unlink(path.join(ctx.config.storageDir, row.storage_filename));

    const downloadResponse = await download(ctx.agent, id);
    assert.equal(downloadResponse.status, 404);

    const deleteResponse = await ctx.agent
      .delete(`/api/files/${id}`)
      .set('X-CSRF-Token', csrf);
    assert.equal(deleteResponse.status, 200);
    assert.equal(await get(ctx.db, 'SELECT id FROM files WHERE id = ?', [id]), undefined);
  } finally {
    await ctx.close();
  }
});

test('ID file tidak valid dan endpoint storage privat tidak dapat diakses', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'id_tester');
    const session = await login(ctx.agent, 'id_tester');

    const invalid = await download(ctx.agent, 'tidak-angka');
    assert.equal(invalid.status, 404);
    const invalidDelete = await ctx.agent
      .delete('/api/files/999999')
      .set('X-CSRF-Token', session.csrf);
    assert.equal(invalidDelete.status, 404);

    await ownerWithFile(ctx, 'id_tester_dua');
    const row = await get(ctx.db, 'SELECT storage_filename FROM files LIMIT 1');
    const notStatic = await ctx.agent.get(`/server/data/storage/${row.storage_filename}`);
    assert.equal(notStatic.status, 404);
    assert.equal(notStatic.text.includes('"ciphertext"'), false);

    const unknownApi = await ctx.agent.get('/api/tidak-ada');
    assert.equal(unknownApi.status, 404);
    assert.equal(unknownApi.body.error.code, 'NOT_FOUND');
  } finally {
    await ctx.close();
  }
});

test('kegagalan enkripsi dan database tidak meninggalkan plaintext atau ciphertext sementara', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'cleanup');
    await login(ctx.agent, 'cleanup');
    const user = await get(ctx.db, 'SELECT id FROM users WHERE username = ?', ['cleanup']);

    await assert.rejects(
      createFile({
        db: ctx.db,
        storageDir: ctx.config.storageDir,
        ownerId: user.id,
        buffer: csvFixture().buffer,
        originalFilename: 'gagal-enkripsi.csv',
        mimeType: 'text/csv',
        algorithm: 'AES',
        masterKey: Buffer.alloc(1)
      }),
      /Master key/
    );
    assert.deepEqual(await storageEntries(ctx), []);

    await exec(ctx.db, 'DROP TABLE files');
    await assert.rejects(
      createFile({
        db: ctx.db,
        storageDir: ctx.config.storageDir,
        ownerId: user.id,
        buffer: csvFixture().buffer,
        originalFilename: 'gagal-db.csv',
        mimeType: 'text/csv',
        algorithm: 'AES',
        masterKey: ctx.config.masterKey
      })
    );
    assert.deepEqual(await storageEntries(ctx), []);
  } finally {
    await ctx.close();
  }
});

test('password dan sesi tidak bocor pada respons file', async () => {
  const ctx = await createTestContext();
  try {
    await ownerWithFile(ctx, 'bocor');
    const list = await ctx.agent.get('/api/files');
    const serialized = JSON.stringify(list.body);
    assert.equal(serialized.includes(TEST_PASSWORD), false);
    assert.equal(serialized.includes(ctx.config.masterKey.toString('base64')), false);
  } finally {
    await ctx.close();
  }
});
