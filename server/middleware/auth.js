'use strict';

const { findUserById } = require('../services/users');
const { AuthenticationError } = require('../errors');

function createRequireAuth(db) {
  return async function requireAuth(req, res, next) {
    try {
      if (!req.session || !req.session.userId) {
        throw new AuthenticationError();
      }
      const user = await findUserById(db, req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        throw new AuthenticationError();
      }
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { createRequireAuth };
