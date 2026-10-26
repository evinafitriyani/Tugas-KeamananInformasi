'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const request = require('supertest');
const { get } = require('../server/db');
const {
  TEST_PASSWORD,
  createTestContext,
  register,
  login,
  upload,
  csvFixture,
  pdfFixture,
  pngFixture,
  docxFixture,
  mp4Fixture
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
    .parse(binaryParser);
}

async function ownerWithFile(ctx, username = 'pemilik') {
  await register(ctx.agent, username);
  const session = await login(ctx.agent, username);
  const file = csvFixture();
  const response = await upload(ctx.agent, session.csrf, file);
  assert.equal(response.status, 201);
  return { csrf: session.csrf, file, id: response.body.file.id };
}

test('pemilik dapat mengunggah, melihat, mengunduh plaintext/ciphertext, dan menghapus', async () => {
  const ctx = await createTestContext();
  try {
    const { csrf, file, id } = await ownerWithFile(ctx);

    const list = await ctx.agent.get('/api/files').expect(200);
    assert.equal(list.body.files.length, 1);
    assert.equal(list.body.files[0].id, id);
    assert.equal(list.body.files[0].algorithm, 'AES');
    assert.equal(list.body.files[0].original_filename, file.filename);
    for (const forbidden of ['storage_filename', 'original_sha256', 'hmac', 'salt']) {
      assert.equal(Object.hasOwn(list.body.files[0], forbidden), false);
    }

    const plaintext = await download(ctx.agent, id);
    assert.equal(plaintext.status, 200);
    assert.deepEqual(plaintext.body, file.buffer);

    const ciphertext = await download(ctx.agent, id, 'ciphertext');
    assert.equal(ciphertext.status, 200);
    const envelope = JSON.parse(ciphertext.body.toString('utf8'));
    assert.equal(envelope.algorithm, 'AES');
    assert.equal(envelope.version, 1);
    assert.ok(envelope.ciphertext);

    const row = await get(ctx.db, 'SELECT storage_filename FROM files WHERE id = ?', [id]);
    const storedPath = path.join(ctx.config.storageDir, row.storage_filename);
    await fs.access(storedPath);

    const deletion = await ctx.agent
      .delete(`/api/files/${id}`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    assert.match(deletion.body.message, /dihapus/i);
    await assert.rejects(fs.access(storedPath), { code: 'ENOENT' });
    const after = await ctx.agent.get('/api/files').expect(200);
    assert.equal(after.body.files.length, 0);
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
    const sessionA = await login(ctx.agent, 'pemilik_a');
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

test('validasi ekstensi, MIME, signature, file kosong, dan batas ukuran', async () => {
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
  } finally {
    await ctx.close();
  }
});

test('semua format yang diizinkan dapat diunggah dan didekripsi', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'format_tester');
    const session = await login(ctx.agent, 'format_tester');
    const fixtures = [csvFixture(), pdfFixture(), pngFixture(), docxFixture(), mp4Fixture()];
    for (const fixture of fixtures) {
      const uploaded = await upload(ctx.agent, session.csrf, fixture, 'RC4');
      assert.equal(uploaded.status, 201, fixture.filename);
      const downloaded = await download(ctx.agent, uploaded.body.file.id);
      assert.equal(downloaded.status, 200);
      assert.deepEqual(downloaded.body, fixture.buffer);
    }
  } finally {
    await ctx.close();
  }
});

test('ciphertext yang dimodifikasi menghasilkan integritas gagal (422)', async () => {
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
  } finally {
    await ctx.close();
  }
});
