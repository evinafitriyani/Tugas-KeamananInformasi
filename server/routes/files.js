'use strict';

const express = require('express');
const multer = require('multer');
const path = require('node:path');
const { createRequireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { asyncHandler } = require('../utils/async-handler');
const { validateUpload, sanitizeFilename } = require('../utils/files');
const { ValidationError } = require('../errors');
const {
  createFile,
  listFiles,
  getOwnedFile,
  decryptFile,
  getCiphertext,
  deleteFile
} = require('../services/files');

const ALLOWED_ALGORITHMS = new Set(['AES', 'DES', 'RC4']);

function asciiFilename(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return fallback || 'file';
}

function dispositionHeader(filename) {
  const safe = sanitizeFilename(filename);
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `attachment; filename="${asciiFilename(safe)}"; filename*=UTF-8''${encoded}`;
}

function createFilesRouter({ db, config }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 8,
      fieldSize: 16 * 1024
    }
  });

  router.use(createRequireAuth(db));
  router.use(requireCsrf);

  router.get('/', asyncHandler(async (req, res) => {
    const files = await listFiles(db, req.user.id);
    res.json({ files });
  }));

  router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    const algorithm = String(req.body.algorithm || 'AES').toUpperCase();
    if (!ALLOWED_ALGORITHMS.has(algorithm)) {
      throw new ValidationError('Algoritma harus AES, DES, atau RC4.');
    }

    const validated = validateUpload(req.file, config.maxUploadBytes);
    const file = await createFile({
      db,
      storageDir: config.storageDir,
      ownerId: req.user.id,
      buffer: req.file.buffer,
      originalFilename: validated.originalFilename,
      mimeType: validated.mime,
      algorithm,
      masterKey: config.masterKey
    });
    req.file.buffer = null;

    console.info('file.upload.success', { algorithm, size: file.original_size_bytes });
    res.status(201).json({ message: 'File berhasil diunggah dan dienkripsi.', file });
  }));

  router.get('/:id/download', asyncHandler(async (req, res) => {
    const row = await getOwnedFile(db, req.user.id, req.params.id);
    const plaintext = await decryptFile(config.storageDir, row, config.masterKey);
    console.info('file.download.success', { algorithm: row.algorithm });
    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Disposition', dispositionHeader(row.original_filename));
    res.setHeader('Cache-Control', 'no-store');
    res.send(plaintext);
  }));

  router.get('/:id/ciphertext', asyncHandler(async (req, res) => {
    const row = await getOwnedFile(db, req.user.id, req.params.id);
    const envelope = await getCiphertext(config.storageDir, row);
    const downloadName = `${path.basename(row.original_filename, path.extname(row.original_filename))}.enc.json`;
    console.info('file.ciphertext.success', { algorithm: row.algorithm });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', dispositionHeader(downloadName));
    res.setHeader('Cache-Control', 'no-store');
    res.send(envelope);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await deleteFile(db, config.storageDir, req.user.id, req.params.id);
    console.info('file.delete.success');
    res.json({ message: 'File dan ciphertext terkait telah dihapus.' });
  }));

  return router;
}

module.exports = { createFilesRouter, dispositionHeader };
