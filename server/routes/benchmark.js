'use strict';

const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/async-handler');

function createBenchmarkRouter({ db, config }) {
  const router = express.Router();
  const resultPath = path.join(config.benchmarkResultsDir, 'latest.json');

  router.get('/latest', createRequireAuth(db), asyncHandler(async (req, res) => {
    let raw;
    try {
      raw = await fs.readFile(resultPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.status(404).json({
          error: {
            code: 'NO_BENCHMARK_RESULTS',
            message: 'Belum ada hasil benchmark. Jalankan npm run benchmark.'
          }
        });
        return;
      }
      throw error;
    }

    const parsed = JSON.parse(raw);
    res.json(parsed);
  }));

  return router;
}

module.exports = { createBenchmarkRouter };
