'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { loadConfig } = require('../server/config');
const { encrypt, verifyAndDecrypt } = require('../server/crypto');
const { summarize, toCsv } = require('./lib');

const ALGORITHMS = ['AES', 'DES', 'RC4'];
const WARMUP_ITERATIONS = 1;
const MEASURED_ITERATIONS = 10;

function now() {
  return performance.now();
}

async function loadFixtures(fixturesDir) {
  const manifestPath = path.join(fixturesDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== 4) {
    throw new Error('Manifest harus berisi tepat empat fixture.');
  }

  const fixtures = [];
  for (const item of manifest.fixtures) {
    const filePath = path.join(fixturesDir, path.basename(item.file));
    const buffer = await fs.readFile(filePath);
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest !== item.sha256 || buffer.length !== item.bytes) {
      throw new Error(`Fixture ${item.id} tidak cocok dengan manifest (hash/ukuran).`);
    }
    fixtures.push({ ...item, buffer });
  }
  return fixtures;
}

function rotatedAlgorithms(offset) {
  const shift = offset % ALGORITHMS.length;
  return [...ALGORITHMS.slice(shift), ...ALGORITHMS.slice(0, shift)];
}

async function writeOutputs(resultsDir, report) {
  await fs.mkdir(resultsDir, { recursive: true });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const csv = toCsv(report.aggregates);

  const jsonTemp = path.join(resultsDir, `.latest.${process.pid}.json.tmp`);
  const csvTemp = path.join(resultsDir, `.latest.${process.pid}.csv.tmp`);
  await fs.writeFile(jsonTemp, json, { mode: 0o600 });
  await fs.writeFile(csvTemp, csv, { mode: 0o600 });
  await fs.rename(jsonTemp, path.join(resultsDir, 'latest.json'));
  await fs.rename(csvTemp, path.join(resultsDir, 'latest.csv'));
}

async function main() {
  const config = loadConfig();
  const fixtures = await loadFixtures(config.benchmarkFixturesDir);
  const results = [];

  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    const rounds = WARMUP_ITERATIONS + MEASURED_ITERATIONS;
    for (let round = 0; round < rounds; round += 1) {
      const isWarmup = round < WARMUP_ITERATIONS;
      const order = rotatedAlgorithms(fixtureIndex + round);
      for (const algorithm of order) {
        let envelope;
        let decryptMs = 0;
        let encryptMs = 0;
        let success = false;

        const encryptStart = now();
        try {
          envelope = encrypt(fixture.buffer, algorithm, config.masterKey);
          encryptMs = now() - encryptStart;
          const decryptStart = now();
          const plaintext = verifyAndDecrypt(envelope, config.masterKey, { algorithm });
          decryptMs = now() - decryptStart;
          success = plaintext.length === fixture.buffer.length && plaintext.equals(fixture.buffer);
        } catch {
          encryptMs = now() - encryptStart;
          success = false;
        }

        results.push({
          fixture_id: fixture.id,
          fixture_name: fixture.name,
          algorithm,
          phase: isWarmup ? 'warmup' : 'measured',
          iteration: isWarmup ? 0 : round - WARMUP_ITERATIONS + 1,
          input_bytes: fixture.buffer.length,
          envelope_bytes: envelope ? envelope.length : 0,
          encrypt_ms: encryptMs,
          decrypt_ms: decryptMs,
          total_ms: encryptMs + decryptMs,
          success
        });
      }
    }
  }

  const measured = results.filter((row) => row.phase === 'measured');
  const aggregates = summarize(measured);
  const failures = measured.filter((row) => !row.success);
  const cpu = os.cpus()[0];

  const report = {
    generated_at: new Date().toISOString(),
    application: 'CampusVault',
    environment: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu_model: cpu ? cpu.model : 'unknown',
      cpu_count: os.cpus().length,
      total_memory_bytes: os.totalmem()
    },
    methodology: {
      warmup_iterations: WARMUP_ITERATIONS,
      measured_iterations: MEASURED_ITERATIONS,
      algorithms: ALGORITHMS,
      fixture_count: fixtures.length,
      includes_kdf: true,
      includes_encryption_and_mac: true,
      includes_mac_verification_and_decryption: true,
      excluded: ['HTTP', 'database', 'filesystem writes'],
      order: 'rotasi deterministik per fixture dan ronde',
      timing_source: 'node:perf_hooks performance.now()',
      statistics: 'mean, median, min, max, sample standard deviation (n-1)'
    },
    fixtures: fixtures.map(({ buffer, ...fixture }) => fixture),
    results,
    aggregates,
    summary: {
      measured_iterations: measured.length,
      successful_iterations: measured.length - failures.length,
      failed_iterations: failures.length
    }
  };

  await writeOutputs(config.benchmarkResultsDir, report);

  for (const aggregate of aggregates) {
    console.info(
      `${aggregate.fixture_id}/${aggregate.algorithm}: ` +
      `encrypt=${aggregate.encrypt_ms.mean_ms.toFixed(3)}ms ` +
      `decrypt=${aggregate.decrypt_ms.mean_ms.toFixed(3)}ms ` +
      `total=${aggregate.total_ms.mean_ms.toFixed(3)}ms`
    );
  }
  console.info(`Benchmark selesai: ${report.summary.successful_iterations}/${report.summary.measured_iterations} sukses.`);

  if (failures.length > 0) {
    console.error(`Benchmark gagal pada ${failures.length} iterasi terukur.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('benchmark.failed', { name: error.name, message: error.message });
  process.exit(1);
});
