'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  mean,
  median,
  sampleStandardDeviation,
  applyStats,
  summarize,
  toCsv
} = require('../benchmark/lib');

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

test('agregasi benchmark mengelompokkan fixture dan algoritma serta menghitung overhead', () => {
  const results = [
    { fixture_id: 'f1', fixture_name: 'Fixture 1', input_bytes: 1000, algorithm: 'AES', success: true, envelope_bytes: 1200, encrypt_ms: 2, decrypt_ms: 1, total_ms: 3 },
    { fixture_id: 'f1', fixture_name: 'Fixture 1', input_bytes: 1000, algorithm: 'AES', success: true, envelope_bytes: 1400, encrypt_ms: 4, decrypt_ms: 3, total_ms: 7 },
    { fixture_id: 'f1', fixture_name: 'Fixture 1', input_bytes: 1000, algorithm: 'RC4', success: false, envelope_bytes: 0, encrypt_ms: 1, decrypt_ms: 0, total_ms: 1 }
  ];
  const aggregates = summarize(results);
  assert.equal(aggregates.length, 2);
  const aes = aggregates.find((entry) => entry.algorithm === 'AES');
  assert.equal(aes.measured_iterations, 2);
  assert.equal(aes.successful_iterations, 2);
  assert.equal(aes.failed_iterations, 0);
  assert.equal(aes.encrypt_ms.mean_ms, 3);
  assert.equal(aes.average_envelope_bytes, 1300);
  assert.equal(aes.overhead_percent, 30);
  assert.equal(aes.throughput_mb_s, (1000 / (1024 * 1024)) / (5 / 1000));
  const rc4 = aggregates.find((entry) => entry.algorithm === 'RC4');
  assert.equal(rc4.failed_iterations, 1);
});

test('CSV benchmark meng-escape nilai khusus', () => {
  const csv = toCsv([
    {
      fixture_id: 'f,1',
      fixture_name: 'Nama "kutip"',
      algorithm: 'AES',
      input_bytes: 10,
      measured_iterations: 1,
      successful_iterations: 1,
      failed_iterations: 0,
      encrypt_ms: { mean_ms: 1, median_ms: 1, stddev_ms: 0 },
      decrypt_ms: { mean_ms: 1, median_ms: 1, stddev_ms: 0 },
      total_ms: { mean_ms: 2, median_ms: 2, stddev_ms: 0 },
      throughput_mb_s: 1,
      average_envelope_bytes: 20,
      overhead_percent: 100
    }
  ]);
  assert.match(csv, /"f,1"/);
  assert.match(csv, /"Nama ""kutip"""/);
});

test('manifest benchmark berisi empat fixture dummy dengan hash dan ukuran yang cocok', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'benchmark', 'fixtures', 'manifest.json'),
    'utf8'
  ));
  assert.equal(manifest.fixtures.length, 4);
  assert.equal(new Set(manifest.fixtures.map((fixture) => fixture.id)).size, 4);
  for (const fixture of manifest.fixtures) {
    const file = fs.readFileSync(path.join(__dirname, '..', 'benchmark', 'fixtures', fixture.file));
    assert.equal(file.length, fixture.bytes);
    assert.equal(require('node:crypto').createHash('sha256').update(file).digest('hex'), fixture.sha256);
  }
});
