'use strict';

const MIB = 1024 * 1024;

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((total, value) => total + ((value - average) ** 2), 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function applyStats(values) {
  return {
    n: values.length,
    mean_ms: mean(values),
    median_ms: median(values),
    min_ms: values.length ? Math.min(...values) : 0,
    max_ms: values.length ? Math.max(...values) : 0,
    stddev_ms: sampleStandardDeviation(values)
  };
}

function throughputMibPerSecond(bytes, milliseconds) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  return (bytes / MIB) / (milliseconds / 1000);
}

function round(value, decimals = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function summarize(results) {
  const groups = new Map();
  for (const row of results) {
    const key = `${row.fixture_id}\u0000${row.algorithm}`;
    if (!groups.has(key)) {
      groups.set(key, {
        fixture_id: row.fixture_id,
        fixture_name: row.fixture_name,
        fixture_category: row.fixture_category,
        mime_type: row.mime_type,
        input_bytes: row.input_bytes,
        input_sha256: row.input_sha256,
        algorithm: row.algorithm,
        mode: row.mode,
        measured_iterations: 0,
        successful_iterations: 0,
        successful_rows: []
      });
    }
    const group = groups.get(key);
    group.measured_iterations += 1;
    const successful = row.round_trip_success !== undefined
      ? row.round_trip_success === true
      : row.success === true;
    if (successful) {
      group.successful_iterations += 1;
      group.successful_rows.push(row);
    }
  }

  return [...groups.values()].map((group) => {
    const rows = group.successful_rows;
    const encryptTimes = rows.map((row) => row.encrypt_ms);
    const decryptTimes = rows.map((row) => row.decrypt_ms);
    const totalTimes = rows.map((row) => row.total_ms);
    const envelopeSizes = rows.map((row) => row.envelope_bytes);
    const overheadBytes = rows.map((row) => row.overhead_bytes);

    const encryptStats = applyStats(encryptTimes);
    const decryptStats = applyStats(decryptTimes);
    const totalStats = applyStats(totalTimes);
    const averageEnvelope = mean(envelopeSizes);
    const averageOverhead = mean(overheadBytes);
    const failed = group.measured_iterations - group.successful_iterations;

    return {
      fixture_id: group.fixture_id,
      fixture_name: group.fixture_name,
      fixture_category: group.fixture_category,
      mime_type: group.mime_type,
      input_bytes: group.input_bytes,
      input_sha256: group.input_sha256,
      algorithm: group.algorithm,
      mode: group.mode,
      measured_iterations: group.measured_iterations,
      successful_iterations: group.successful_iterations,
      failed_iterations: failed,
      round_trip_correct: failed === 0 && group.successful_iterations > 0,
      encrypt_ms: encryptStats,
      decrypt_ms: decryptStats,
      total_ms: totalStats,
      encrypt_throughput_mib_s: round(throughputMibPerSecond(group.input_bytes, encryptStats.mean_ms)),
      decrypt_throughput_mib_s: round(throughputMibPerSecond(group.input_bytes, decryptStats.mean_ms)),
      total_throughput_mib_s: round(throughputMibPerSecond(group.input_bytes, totalStats.mean_ms)),
      average_envelope_bytes: round(averageEnvelope),
      average_overhead_bytes: round(averageOverhead),
      overhead_percent: group.input_bytes > 0
        ? round((averageOverhead / group.input_bytes) * 100)
        : null
    };
  });
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS = [
  'fixture_id',
  'fixture_name',
  'fixture_category',
  'mime_type',
  'input_bytes',
  'input_sha256',
  'algorithm',
  'mode',
  'measured_iterations',
  'successful_iterations',
  'failed_iterations',
  'round_trip_correct',
  'encrypt_mean_ms',
  'encrypt_median_ms',
  'encrypt_min_ms',
  'encrypt_max_ms',
  'encrypt_sample_stddev_ms',
  'decrypt_mean_ms',
  'decrypt_median_ms',
  'decrypt_min_ms',
  'decrypt_max_ms',
  'decrypt_sample_stddev_ms',
  'total_mean_ms',
  'total_median_ms',
  'total_min_ms',
  'total_max_ms',
  'total_sample_stddev_ms',
  'encrypt_throughput_mib_s',
  'decrypt_throughput_mib_s',
  'total_throughput_mib_s',
  'average_envelope_bytes',
  'average_overhead_bytes',
  'overhead_percent'
];

function toCsv(aggregates) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of aggregates) {
    lines.push([
      row.fixture_id,
      row.fixture_name,
      row.fixture_category,
      row.mime_type,
      row.input_bytes,
      row.input_sha256,
      row.algorithm,
      row.mode,
      row.measured_iterations,
      row.successful_iterations,
      row.failed_iterations,
      row.round_trip_correct,
      row.encrypt_ms.mean_ms,
      row.encrypt_ms.median_ms,
      row.encrypt_ms.min_ms,
      row.encrypt_ms.max_ms,
      row.encrypt_ms.stddev_ms,
      row.decrypt_ms.mean_ms,
      row.decrypt_ms.median_ms,
      row.decrypt_ms.min_ms,
      row.decrypt_ms.max_ms,
      row.decrypt_ms.stddev_ms,
      row.total_ms.mean_ms,
      row.total_ms.median_ms,
      row.total_ms.min_ms,
      row.total_ms.max_ms,
      row.total_ms.stddev_ms,
      row.encrypt_throughput_mib_s,
      row.decrypt_throughput_mib_s,
      row.total_throughput_mib_s,
      row.average_envelope_bytes,
      row.average_overhead_bytes,
      row.overhead_percent
    ].map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  MIB,
  CSV_COLUMNS,
  mean,
  median,
  sampleStandardDeviation,
  applyStats,
  throughputMibPerSecond,
  round,
  summarize,
  toCsv,
  csvEscape
};
