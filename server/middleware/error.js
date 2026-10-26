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

function logFailure(req, error) {
  const code = error && error.code ? error.code : 'INTERNAL_ERROR';
  if (code === 'INTEGRITY_CHECK_FAILED') {
    console.warn('file.integrity.failure');
  }
  if (req.baseUrl === '/api/auth') {
    console.info('auth.request.failure', { code });
  } else if (req.baseUrl === '/api/files') {
    console.info('file.request.failure', { code });
  }
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    logFailure(req, error);
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
    logFailure(req, error);
    res.status(error.status).json({
      error: { code: error.code, message: error.message }
    });
    return;
  }

  if (error && error.status && error.code) {
    logFailure(req, error);
    res.status(error.status).json({
      error: { code: error.code, message: error.message }
    });
    return;
  }

  if (error && error.type === 'entity.parse.failed') {
    logFailure(req, error);
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Body JSON tidak valid.' }
    });
    return;
  }

  logFailure(req, error);
  console.error('unhandled.error', { name: error && error.name, message: error && error.message });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal.' }
  });
}

module.exports = { notFoundApi, errorHandler };
