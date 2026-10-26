'use strict';

const multer = require('multer');
const { AppError } = require('../errors');

function notFoundApi(req, res, next) {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' }
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: { code: 'FILE_TOO_LARGE', message: 'Ukuran file melebihi batas unggah.' }
      });
      return;
    }
    res.status(400).json({
      error: { code: 'UPLOAD_ERROR', message: 'Unggahan file tidak valid.' }
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message }
    });
    return;
  }

  if (error && error.status && error.code) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message }
    });
    return;
  }

  if (error && error.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Body JSON tidak valid.' }
    });
    return;
  }

  console.error('unhandled.error', { name: error && error.name, message: error && error.message });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal.' }
  });
}

module.exports = { notFoundApi, errorHandler };
