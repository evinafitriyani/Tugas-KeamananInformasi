'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { loadConfig } = require('../server/config');
const { encrypt, verifyAndDecrypt, ALGORITHMS } = require('../server/crypto');
const { summarize, toCsv, throughputMibPerSecond, round } = require('./lib');

const SCHEMA_VERSION = 1;
const ALGORITHMS_TO_TEST = ['AES', 'DES', 'RC4'];
const WARMUP_ITERATIONS = 1;
const MEASURED_ITERATIONS = 10;

function now() {
  return performance.now();
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function loadFixtures(fixturesDir) {
  const manifestPath = path.join(fixturesDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== 4) {
    throw new Error('Manifest harus berisi tepat empat fixture.');
  }
  if (new Set(manifest.fixtures.map((item) => item.id)).size !== manifest.fixtures.length) {
    throw new Error('ID fixture pada manifest harus unik.');
  }

  const fixtures = [];
  for (const item of manifest.fixtures) {
    if (!item || typeof item.file !== 'string' || path.basename(item.file) !== item.file) {
      throw new Error('Nama file fixture tidak valid.');
    }
    const filePath = path.join(fixturesDir, item.file);
    const buffer = await fs.readFile(filePath);
    const digest = sha256Hex(buffer);
    if (digest !== item.sha256 || buffer.length !== item.bytes) {
      throw new Error(`Fixture ${item.id} tidak cocok dengan manifest (hash/ukuran).`);
    }
    fixtures.push({ ...item, buffer, sha256: digest });
  }
  return fixtures;
}

function rotatedAlgorithms(offset) {
  const shift = offset % ALGORITHMS_TO_TEST.length;
  return [...ALGORITHMS_TO_TEST.slice(shift), ...ALGORITHMS_TO_TEST.slice(0, shift)];
}

function environmentInfo() {
  const cpu = os.cpus()[0];
  return {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    os_release: os.release(),
    cpu_model: cpu ? cpu.model : 'unknown',
    cpu_count: os.cpus().length,
    total_memory_bytes: os.totalmem(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  };
}

async function writeOutputs(resultsDir, report) {
  await fs.mkdir(resultsDir, { recursive: true, mode: 0o700 });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const csv = toCsv(report.aggregates);

  const jsonTemp = path.join(resultsDir, `.latest.${process.pid}.json.tmp`);
  const csvTemp = path.join(resultsDir, `.latest.${process.pid}.csv.tmp`);
  await fs.writeFile(jsonTemp, json, { mode: 0o600 });
  await fs.writeFile(csvTemp, csv, { mode: 0o600 });
  await fs.rename(jsonTemp, path.join(resultsDir, 'latest.json'));
  await fs.rename(csvTemp, path.join(resultsDir, 'latest.csv'));
}

function buildResultRow({
  fixture,
  algorithm,
  warmup,
  iteration,
  encryptMs,
  decryptMs,
  envelopeBytes,
  success,
  sha256Match,
  failureReason,
  environment,
  timestamp
}) {
  const totalMs = encryptMs + decryptMs;
  const overheadBytes = envelopeBytes - fixture.buffer.length;
  return {
    fixture_id: fixture.id,
    fixture_name: fixture.name,
    fixture_category: fixture.category,
    mime_type: fixture.mime_type,
    input_bytes: fixture.buffer.length,
    input_sha256: fixture.sha256,
    algorithm,
    mode: ALGORITHMS[algorithm].mode,
    phase: warmup ? 'warmup' : 'measured',
    warmup,
    iteration,
    encrypt_ms: round(encryptMs),
    decrypt_ms: round(decryptMs),
    total_ms: round(totalMs),
    encryption_throughput_mib_s: round(
      throughputMibPerSecond(fixture.buffer.length, encryptMs)
    ),
    decryption_throughput_mib_s: round(
      throughputMibPerSecond(fixture.buffer.length, decryptMs)
    ),
    total_throughput_mib_s: round(
      throughputMibPerSecond(fixture.buffer.length, totalMs)
    ),
    envelope_bytes: envelopeBytes,
    overhead_bytes: overheadBytes,
    overhead_percent: fixture.buffer.length > 0
      ? round((overheadBytes / fixture.buffer.length) * 100)
      : null,
    round_trip_success: success,
    sha256_match: sha256Match,
    failure_reason: failureReason || null,
    runtime_version: environment.node_version,
    os_platform: environment.platform,
    os_arch: environment.arch,
    cpu_model: environment.cpu_model,
    timestamp
  };
}

async function runBenchmark(options = {}) {
  const config = options.config || loadConfig();
  const fixtures = options.fixtures || await loadFixtures(config.benchmarkFixturesDir);
  const resultsDir = options.resultsDir || config.benchmarkResultsDir;
  const warmupIterations = options.warmupIterations ?? WARMUP_ITERATIONS;
  const measuredIterations = options.measuredIterations ?? MEASURED_ITERATIONS;
  const environment = environmentInfo();
  const results = [];

  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    const rounds = warmupIterations + measuredIterations;
    for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
      const isWarmup = roundIndex < warmupIterations;
      const iteration = isWarmup ? 0 : roundIndex - warmupIterations + 1;
      const order = rotatedAlgorithms(fixtureIndex + roundIndex);

      for (const algorithm of order) {
        let encryptMs = 0;
        let decryptMs = 0;
        let decryptStart = null;
        let envelopeBytes = 0;
        let success = false;
        let sha256Match = false;
        let failureReason = null;

        const encryptStart = now();
        try {
          const envelope = encrypt(fixture.buffer, algorithm, config.masterKey);
          encryptMs = now() - encryptStart;
          envelopeBytes = envelope.length;

          decryptStart = now();
          const plaintext = verifyAndDecrypt(envelope, config.masterKey, {
            algorithm,
            mode: ALGORITHMS[algorithm].mode,
            sha256: fixture.sha256,
            size: fixture.buffer.length
          });
          decryptMs = now() - decryptStart;

          sha256Match = plaintext.length === fixture.buffer.length &&
            sha256Hex(plaintext) === fixture.sha256;
          success = sha256Match && plaintext.equals(fixture.buffer);
          if (!success) failureReason = 'ROUND_TRIP_MISMATCH';
        } catch (error) {
          if (encryptMs === 0) encryptMs = now() - encryptStart;
          if (decryptStart !== null) decryptMs = now() - decryptStart;
          failureReason = error && error.code ? error.code : 'BENCHMARK_ERROR';
          success = false;
        }

        results.push(buildResultRow({
          fixture,
          algorithm,
          warmup: isWarmup,
          iteration,
          encryptMs,
          decryptMs,
          envelopeBytes,
          success,
          sha256Match,
          failureReason,
          environment,
          timestamp: new Date().toISOString()
        }));
      }
    }
  }

  const measured = results.filter((row) => row.phase === 'measured');
  const warmups = results.filter((row) => row.phase === 'warmup');
  const aggregates = summarize(measured);
  const failures = measured.filter((row) => !row.round_trip_success);

  const expectedMeasured = fixtures.length * ALGORITHMS_TO_TEST.length * measuredIterations;
  const expectedWarmup = fixtures.length * ALGORITHMS_TO_TEST.length * warmupIterations;
  if (measured.length !== expectedMeasured || warmups.length !== expectedWarmup) {
    throw new Error('Jumlah baris benchmark tidak sesuai konfigurasi.');
  }

  const report = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    application: 'CampusVault',
    environment,
    methodology: {
      warmup_iterations: warmupIterations,
      measured_iterations: measuredIterations,
      algorithms: ALGORITHMS_TO_TEST,
      fixture_count: fixtures.length,
      combinations: fixtures.length * ALGORITHMS_TO_TEST.length,
      timer: 'node:perf_hooks performance.now()',
      includes_kdf: true,
      kdf: 'HKDF-SHA256 with a fresh random per-envelope salt',
      includes_encryption_and_mac: true,
      includes_mac_verification_and_decryption: true,
      includes_sha256_correctness_check: true,
      excluded: ['HTTP/network', 'database', 'filesystem writes', 'browser rendering'],
      algorithm_order: 'rotasi deterministik per fixture dan ronde',
      statistics: 'mean, median, min, max, sample standard deviation (n-1)'
    },
    fixtures: fixtures.map(({ buffer: _buffer, ...fixture }) => fixture),
    results,
    aggregates,
    summary: {
      total_warmup_rows: warmups.length,
      total_measured_rows: measured.length,
      measured_iterations_per_combination: measuredIterations,
      successful_measured_iterations: measured.length - failures.length,
      failed_measured_iterations: failures.length,
      all_round_trips_correct: failures.length === 0
    }
  };

  await writeOutputs(resultsDir, report);
  return report;
}

async function main() {
  const config = loadConfig();
  const report = await runBenchmark({ config });

  for (const aggregate of report.aggregates) {
    console.info(
      `${aggregate.fixture_id}/${aggregate.algorithm}: ` +
      `encrypt=${aggregate.encrypt_ms.mean_ms.toFixed(3)}ms ` +
      `decrypt=${aggregate.decrypt_ms.mean_ms.toFixed(3)}ms ` +
      `total=${aggregate.total_ms.mean_ms.toFixed(3)}ms ` +
      `overhead=${aggregate.overhead_percent.toFixed(2)}% ` +
      `correct=${aggregate.round_trip_correct}`
    );
  }
  console.info(
    `Benchmark selesai: ${report.summary.successful_measured_iterations}/` +
    `${report.summary.total_measured_rows} iterasi terukur sukses.`
  );

  if (!report.summary.all_round_trips_correct) {
    console.error(
      `Benchmark gagal pada ${report.summary.failed_measured_iterations} iterasi terukur.`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('benchmark.failed', { name: error.name, message: error.message });
    process.exit(1);
  });
}

module.exports = {
  SCHEMA_VERSION,
  ALGORITHMS_TO_TEST,
  WARMUP_ITERATIONS,
  MEASURED_ITERATIONS,
  loadFixtures,
  rotatedAlgorithms,
  environmentInfo,
  buildResultRow,
  writeOutputs,
  runBenchmark
};
