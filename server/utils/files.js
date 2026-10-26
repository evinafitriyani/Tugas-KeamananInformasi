'use strict';

const path = require('node:path');
const { isUtf8 } = require('node:buffer');
const { ValidationError, UnsupportedMediaError } = require('../errors');

const TYPES = {
  csv: {
    category: 'personal',
    mimes: ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv']
  },
  pdf: {
    category: 'document',
    mimes: ['application/pdf']
  },
  jpg: {
    category: 'image',
    mimes: ['image/jpeg']
  },
  jpeg: {
    category: 'image',
    mimes: ['image/jpeg']
  },
  png: {
    category: 'image',
    mimes: ['image/png']
  },
  docx: {
    category: 'office',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  },
  xlsx: {
    category: 'office',
    mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  },
  pptx: {
    category: 'office',
    mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
  },
  mp4: {
    category: 'video',
    mimes: ['video/mp4']
  },
  webm: {
    category: 'video',
    mimes: ['video/webm']
  }
};

function sanitizeFilename(input) {
  const base = path.basename(String(input || 'file'));
  const withoutControls = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_');
  const trimmed = withoutControls.trim().slice(0, 200);
  return trimmed || 'file';
}

function extensionOf(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function assertSignature(extension, buffer) {
  const startsWith = (signature) => buffer.length >= signature.length &&
    signature.every((byte, index) => buffer[index] === byte);

  switch (extension) {
    case 'pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    case 'jpg':
      return startsWith([0xff, 0xd8, 0xff]);
    case 'png':
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return startsWith([0x50, 0x4b, 0x03, 0x04]) ||
        startsWith([0x50, 0x4b, 0x05, 0x06]) ||
        startsWith([0x50, 0x4b, 0x07, 0x08]);
    case 'mp4':
      return buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'webm':
      return startsWith([0x1a, 0x45, 0xdf, 0xa3]);
    case 'csv':
      return !buffer.includes(0) && isUtf8(buffer);
    default:
      return false;
  }
}

function validateUpload(file, maxBytes) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new ValidationError('File wajib diunggah.');
  }
  if (file.size === 0) {
    throw new ValidationError('File kosong tidak didukung.');
  }
  if (file.size > maxBytes) {
    const error = new ValidationError(`Ukuran file melebihi batas ${Math.floor(maxBytes / (1024 * 1024))} MiB.`);
    error.status = 413;
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }

  const originalFilename = sanitizeFilename(file.originalname);
  const extension = extensionOf(originalFilename);
  const type = TYPES[extension];
  if (!type) {
    throw new UnsupportedMediaError('Ekstensi file tidak diizinkan.');
  }

  const mime = String(file.mimetype || '').toLowerCase();
  if (!type.mimes.includes(mime)) {
    throw new UnsupportedMediaError('MIME type tidak cocok dengan ekstensi file.');
  }

  if (!assertSignature(extension, file.buffer)) {
    throw new UnsupportedMediaError('Isi file tidak cocok dengan ekstensi atau MIME type.');
  }

  return { originalFilename, extension, mime, category: type.category };
}

module.exports = {
  TYPES,
  sanitizeFilename,
  extensionOf,
  validateUpload,
  assertSignature
};
