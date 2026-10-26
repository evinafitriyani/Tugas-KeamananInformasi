'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { run, get, all, withTransaction } = require('../db');
const { encrypt, verifyAndDecrypt, ALGORITHMS, ENVELOPE_VERSION } = require('../crypto');
const { NotFoundError, ValidationError } = require('../errors');
const { sanitizeFilename } = require('../utils/files');

function modeFor(algorithm) {
  const config = ALGORITHMS[algorithm];
  if (!config) throw new Error('Algoritma tidak didukung.');
  return config.mode;
}

function storagePath(storageDir, storageFilename) {
  const safeName = path.basename(String(storageFilename));
  if (safeName !== storageFilename || safeName.includes('/') || safeName.includes('\\')) {
    throw new Error('Nama penyimpanan tidak valid.');
  }
  return path.join(storageDir, safeName);
}

function publicMetadata(row) {
  return {
    id: row.id,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    original_size_bytes: row.original_size_bytes,
    encrypted_size_bytes: row.encrypted_size_bytes,
    algorithm: row.algorithm,
    mode: row.mode,
    envelope_version: row.envelope_version,
    created_at: row.created_at
  };
}

async function createFile({ db, storageDir, ownerId, buffer, originalFilename, mimeType, algorithm, masterKey }) {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    throw new ValidationError('Pemilik file tidak valid.');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ValidationError('File kosong tidak didukung.');
  }
  const mode = modeFor(algorithm);
  const safeOriginalFilename = sanitizeFilename(originalFilename);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const envelope = encrypt(buffer, algorithm, masterKey);
  const storageFilename = `${crypto.randomBytes(24).toString('hex')}.json`;
  const temporaryName = `.${storageFilename}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  const finalPath = storagePath(storageDir, storageFilename);
  const temporaryPath = storagePath(storageDir, temporaryName);
  const createdAt = new Date().toISOString();

  await fs.mkdir(storageDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(temporaryPath, envelope, { flag: 'wx', mode: 0o600 });

  let result;
  try {
    result = await withTransaction(db, () => run(
      db,
      `INSERT INTO files (
        owner_id, original_filename, storage_filename, mime_type,
        original_size_bytes, encrypted_size_bytes, algorithm, mode,
        envelope_version, original_sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ownerId,
        safeOriginalFilename,
        storageFilename,
        mimeType,
        buffer.length,
        envelope.length,
        algorithm,
        mode,
        ENVELOPE_VERSION,
        sha256,
        createdAt
      ]
    ));
    await fs.rename(temporaryPath, finalPath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    if (result && result.lastID) {
      await run(db, 'DELETE FROM files WHERE id = ?', [result.lastID]).catch(() => {});
    }
    await fs.unlink(finalPath).catch(() => {});
    throw error;
  }

  return {
    id: result.lastID,
    original_filename: safeOriginalFilename,
    mime_type: mimeType,
    original_size_bytes: buffer.length,
    encrypted_size_bytes: envelope.length,
    algorithm,
    mode,
    envelope_version: ENVELOPE_VERSION,
    created_at: createdAt
  };
}

async function listFiles(db, ownerId) {
  const rows = await all(
    db,
    `SELECT id, original_filename, mime_type, original_size_bytes, encrypted_size_bytes,
            algorithm, mode, envelope_version, created_at
     FROM files
     WHERE owner_id = ?
     ORDER BY created_at DESC, id DESC`,
    [ownerId]
  );
  return rows.map(publicMetadata);
}

async function getOwnedFile(db, ownerId, fileId) {
  const id = Number.parseInt(fileId, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new NotFoundError();
  }
  const row = await get(db, 'SELECT * FROM files WHERE id = ? AND owner_id = ?', [id, ownerId]);
  if (!row) throw new NotFoundError();
  return row;
}

async function readEnvelope(storageDir, row) {
  const filename = storagePath(storageDir, row.storage_filename);
  try {
    return await fs.readFile(filename);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new NotFoundError('File terenkripsi tidak ditemukan pada penyimpanan.');
    }
    throw error;
  }
}

async function decryptFile(storageDir, row, masterKey) {
  const envelope = await readEnvelope(storageDir, row);
  return verifyAndDecrypt(envelope, masterKey, {
    algorithm: row.algorithm,
    mode: row.mode,
    version: row.envelope_version,
    sha256: row.original_sha256,
    size: row.original_size_bytes
  });
}

async function getCiphertext(storageDir, row) {
  return readEnvelope(storageDir, row);
}

async function deleteFile(db, storageDir, ownerId, fileId) {
  const row = await getOwnedFile(db, ownerId, fileId);
  const filename = storagePath(storageDir, row.storage_filename);

  // Remove the authorization-relevant metadata first. If the physical unlink
  // then fails, restore the row so the owner can retry instead of leaving
  // metadata that points at an already-missing file.
  await run(db, 'DELETE FROM files WHERE id = ? AND owner_id = ?', [row.id, ownerId]);
  try {
    await fs.unlink(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    try {
      await run(
        db,
        `INSERT INTO files (
          id, owner_id, original_filename, storage_filename, mime_type,
          original_size_bytes, encrypted_size_bytes, algorithm, mode,
          envelope_version, original_sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.owner_id,
          row.original_filename,
          row.storage_filename,
          row.mime_type,
          row.original_size_bytes,
          row.encrypted_size_bytes,
          row.algorithm,
          row.mode,
          row.envelope_version,
          row.original_sha256,
          row.created_at
        ]
      );
    } catch (restoreError) {
      console.error('file.delete.rollback_failed', {
        name: restoreError.name,
        message: restoreError.message
      });
    }
    throw error;
  }
}

module.exports = {
  createFile,
  listFiles,
  getOwnedFile,
  readEnvelope,
  decryptFile,
  getCiphertext,
  deleteFile,
  publicMetadata
};
