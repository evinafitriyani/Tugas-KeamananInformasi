'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../server/config');
const {
  mean,
  median,
  sampleStandardDeviation,
  applyStats,
  summarize,
  toCsv,
  CSV_COLUMNS
} = require('../benchmark/lib');
const { runBenchmark, loadFixtures } = require('../benchmark/run');
const { createTestContext, register, login, testEnvironment } = require('./helpers');

function resultRow(overrides = {}) {
  return {
    fixture_id: 'f1',
    fixture_name: 'Fixture 1',
    fixture_category: 'personal',
    mime_type: 'text/csv',
    input_bytes: 1000,
    input_sha256: 'a'.repeat(64),
    algorithm: 'AES',
    mode: 'CBC',
    phase: 'measured',
    warmup: false,
    iteration: 1,
    encrypt_ms: 2,
    decrypt_ms: 1,
    total_ms: 3,
    encryption_throughput_mib_s: 1,
    decryption_throughput_mib_s: 2,
    envelope_bytes: 1200,
    overhead_bytes: 200,
    overhead_percent: 20,
    round_trip_success: true,
    sha256_match: true,
    failure_reason: null,
    runtime_version: process.version,
    os_platform: process.platform,
    cpu_model: 'test-cpu',
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

test('perhitungan mean, median, dan sample standard deviation benar', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7, 1, 3]), 3);
  assert.equal(sampleStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935299395);
  const stats = applyStats([1, 2, 3]);
  assert.equal(stats.n, 3);
  assert.equal(stats.mean_ms, 2);
  assert.equal(stats.median_ms, 2);
  assert.equal(stats.min_ms, 1);
  assert.equal(stats.max_ms, 3);
  assert.equal(stats.stddev_ms, 1);
});

test('agregasi mengelompokkan fixture/algoritma, menghitung overhead, throughput, dan kegagalan', () => {
  const results = [
    resultRow(),
    resultRow({ encrypt_ms: 4, decrypt_ms: 3, total_ms: 7, envelope_bytes: 1400, overhead_bytes: 400 }),
    resultRow({
      algorithm: 'RC4',
      mode: 'STREAM',
      round_trip_success: false,
      sha256_match: false,
      failure_reason: 'ROUND_TRIP_MISMATCH',
      envelope_bytes: 0,
      overhead_bytes: -1000
    }),
    resultRow({
      algorithm: 'DES',
      round_trip_success: false,
      sha256_match: false,
      failure_reason: 'INTEGRITY_CHECK_FAILED',
      envelope_bytes: 0,
      overhead_bytes: -1000
    })
  ];
  const aggregates = summarize(results);
  assert.equal(aggregates.length, 3);

  const aes = aggregates.find((entry) => entry.algorithm === 'AES');
  assert.equal(aes.measured_iterations, 2);
  assert.equal(aes.successful_iterations, 2);
  assert.equal(aes.failed_iterations, 0);
  assert.equal(aes.round_trip_correct, true);
  assert.equal(aes.encrypt_ms.mean_ms, 3);
  assert.equal(aes.encrypt_ms.min_ms, 2);
  assert.equal(aes.encrypt_ms.max_ms, 4);
  assert.equal(aes.average_envelope_bytes, 1300);
  assert.equal(aes.average_overhead_bytes, 300);
  assert.equal(aes.overhead_percent, 30);
  const expectedThroughput = (1000 / (1024 * 1024)) / (5 / 1000);
  assert.equal(aes.total_throughput_mib_s, Math.round(expectedThroughput * 1e6) / 1e6);

  const rc4 = aggregates.find((entry) => entry.algorithm === 'RC4');
  assert.equal(rc4.failed_iterations, 1);
  assert.equal(rc4.successful_iterations, 0);
  assert.equal(rc4.round_trip_correct, false);
  assert.equal(rc4.encrypt_ms.n, 0);

  const csv = toCsv(aggregates);
  const header = csv.split('\n')[0].split(',');
  assert.deepEqual(header, CSV_COLUMNS);
  assert.ok(header.includes('overhead_percent'));
  assert.ok(header.includes('round_trip_correct'));
});

test('CSV benchmark meng-escape nilai khusus', () => {
  const aggregate = summarize([resultRow({ fixture_id: 'f,1', fixture_name: 'Nama "kutip"' })])[0];
  const csv = toCsv([aggregate]);
  assert.match(csv, /"f,1"/);
  assert.match(csv, /"Nama ""kutip"""/);
});

test('manifest benchmark berisi empat fixture dummy dengan hash dan ukuran yang cocok', async () => {
  const fixturesDir = path.join(__dirname, '..', 'benchmark', 'fixtures');
  const manifest = JSON.parse(await fs.readFile(path.join(fixturesDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.fixtures.length, 4);
  assert.equal(new Set(manifest.fixtures.map((fixture) => fixture.id)).size, 4);
  for (const fixture of manifest.fixtures) {
    const file = await fs.readFile(path.join(fixturesDir, fixture.file));
    assert.equal(file.length, fixture.bytes);
    assert.equal(crypto.createHash('sha256').update(file).digest('hex'), fixture.sha256);
  }
});

test('runner menghasilkan laporan nyata: warm-up terpisah, 10 iterasi terukur, dan semua benar', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'campusvault-benchmark-test-'));
  const resultsDir = path.join(directory, 'results');
  try {
    const config = loadConfig(testEnvironment(directory));
    const fixtures = await loadFixtures(config.benchmarkFixturesDir);
    assert.equal(fixtures.length, 4);

    const report = await runBenchmark({ config, fixtures, resultsDir });
    assert.equal(report.schema_version, 1);
    assert.equal(report.application, 'CampusVault');
    assert.equal(report.environment.node_version, process.version);
    assert.equal(report.methodology.warmup_iterations, 1);
    assert.equal(report.methodology.measured_iterations, 10);
    assert.equal(report.methodology.includes_kdf, true);
    assert.equal(report.fixtures.length, 4);

    assert.equal(report.results.length, 132);
    assert.equal(report.results.filter((row) => row.phase === 'warmup').length, 12);
    assert.equal(report.results.filter((row) => row.phase === 'measured').length, 120);
    assert.equal(report.aggregates.length, 12);
    assert.equal(report.summary.total_measured_rows, 120);
    assert.equal(report.summary.failed_measured_iterations, 0);
    assert.equal(report.summary.all_round_trips_correct, true);

    for (const aggregate of report.aggregates) {
      assert.equal(aggregate.measured_iterations, 10);
      assert.equal(aggregate.successful_iterations, 10);
      assert.equal(aggregate.failed_iterations, 0);
      assert.equal(aggregate.round_trip_correct, true);
      assert.equal(aggregate.encrypt_ms.n, 10);
      assert.equal(aggregate.decrypt_ms.n, 10);
      assert.equal(aggregate.total_ms.n, 10);
      assert.ok(aggregate.overhead_percent > 0);
      assert.ok(aggregate.average_envelope_bytes > aggregate.input_bytes);
      assert.ok(aggregate.encrypt_throughput_mib_s > 0);
      assert.ok(aggregate.decrypt_throughput_mib_s > 0);
    }

    for (const fixture of report.fixtures) {
      const rows = report.results.filter((row) => row.fixture_id === fixture.id);
      assert.equal(new Set(rows.map((row) => row.input_sha256)).size, 1);
      assert.equal(rows[0].input_sha256, fixture.sha256);
      for (const algorithm of ['AES', 'DES', 'RC4']) {
        const measured = rows.filter((row) =>
          row.algorithm === algorithm && row.phase === 'measured');
        assert.equal(measured.length, 10);
        assert.equal(measured.every((row) => row.round_trip_success), true);
        assert.equal(measured.every((row) => row.sha256_match), true);
      }
    }

    const json = JSON.parse(await fs.readFile(path.join(resultsDir, 'latest.json'), 'utf8'));
    assert.deepEqual(json, report);
    const csv = await fs.readFile(path.join(resultsDir, 'latest.csv'), 'utf8');
    assert.equal(csv.split('\n')[0], CSV_COLUMNS.join(','));
    assert.equal(csv.trim().split('\n').length, 13);

    const schema = JSON.parse(await fs.readFile(
      path.join(__dirname, '..', 'benchmark', 'schema.json'),
      'utf8'
    ));
    for (const key of schema.required) {
      assert.equal(Object.hasOwn(report, key), true, key);
    }
    for (const key of schema.properties.results.items.required) {
      assert.equal(Object.hasOwn(report.results[0], key), true, key);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('endpoint benchmark memberi 404 yang jelas sebelum benchmark dijalankan', async () => {
  const ctx = await createTestContext();
  try {
    await register(ctx.agent, 'benchmark_empty');
    await login(ctx.agent, 'benchmark_empty');
    const response = await ctx.agent.get('/api/benchmark/latest');
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'NO_BENCHMARK_RESULTS');
    assert.match(response.body.error.message, /npm run benchmark/);
  } finally {
    await ctx.close();
  }
});
