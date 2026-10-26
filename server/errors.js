'use strict';

class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

class ValidationError extends AppError {
  constructor(message = 'Input tidak valid.') {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Silakan masuk terlebih dahulu.') {
    super(401, 'AUTH_REQUIRED', message);
    this.name = 'AuthenticationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'File tidak ditemukan.') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

class IntegrityError extends AppError {
  constructor(message = 'Pemeriksaan integritas file gagal.') {
    super(422, 'INTEGRITY_CHECK_FAILED', message);
    this.name = 'IntegrityError';
  }
}

class UnsupportedMediaError extends AppError {
  constructor(message = 'Jenis file tidak didukung.') {
    super(415, 'UNSUPPORTED_MEDIA_TYPE', message);
    this.name = 'UnsupportedMediaError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  IntegrityError,
  UnsupportedMediaError
};
