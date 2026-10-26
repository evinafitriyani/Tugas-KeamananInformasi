'use strict';

const session = require('express-session');
const { run, get } = require('./db');

class SqliteSessionStore extends session.Store {
  constructor(db, ttlMs) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
  }

  async get(sid, callback) {
    try {
      const row = await get(this.db, 'SELECT sess, expires FROM sessions WHERE sid = ?', [sid]);
      if (!row) {
        callback(null, null);
        return;
      }
      if (row.expires <= Date.now()) {
        await run(this.db, 'DELETE FROM sessions WHERE sid = ?', [sid]);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.sess));
    } catch (error) {
      callback(error);
    }
  }

  async set(sid, value, callback) {
    try {
      const expires = value.cookie && value.cookie.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + this.ttlMs;
      await run(
        this.db,
        'INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ' +
          'ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires',
        [sid, JSON.stringify(value), expires]
      );
      await run(this.db, 'DELETE FROM sessions WHERE expires <= ?', [Date.now()]);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async destroy(sid, callback) {
    try {
      await run(this.db, 'DELETE FROM sessions WHERE sid = ?', [sid]);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async touch(sid, value, callback) {
    try {
      const expires = value.cookie && value.cookie.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + this.ttlMs;
      await run(this.db, 'UPDATE sessions SET expires = ? WHERE sid = ?', [expires, sid]);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

module.exports = { SqliteSessionStore };
