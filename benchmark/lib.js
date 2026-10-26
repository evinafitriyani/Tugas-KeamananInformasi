'use strict';

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

function summarize(results) {
  const groups = new Map();
  for (const row of results) {
    const key = `${row.fixture_id}\u0000${row.algorithm}`;
    if (!groups.has(key)) {
      groups.set(key, {
        fixture_id: row.fixture_id,
        fixture_name: row.fixture_name,
        input_bytes: row.input_bytes,
        algorithm: row.algorithm,
        measured_iterations: 0,
        successful_iterations: 0,
        encryption: [],
        decryption: [],
        total: [],
        envelope_sizes: []
      });
    }
    const group = groups.get(key);
    group.measured_iterations += 1;
    group.envelope_sizes.push(row.envelope_bytes);
    if (row.success) group.successful_iterations += 1;
    group.encryption.push(row.encrypt_ms);
    group.decryption.push(row.decrypt_ms);
    group.total.push(row.total_ms);
  }

  return [...groups.values()].map((group) => {
    const averageTotal = mean(group.total);
    const averageEnvelope = mean(group.envelope_sizes);
    return {
      fixture_id: group.fixture_id,
      fixture_name: group.fixture_name,
      input_bytes: group.input_bytes,
      algorithm: group.algorithm,
      measured_iterations: group.measured_iterations,
      successful_iterations: group.successful_iterations,
      failed_iterations: group.measured_iterations - group.successful_iterations,
      encrypt_ms: applyStats(group.encryption),
      decrypt_ms: applyStats(group.decryption),
      total_ms: applyStats(group.total),
      average_envelope_bytes: averageEnvelope,
      overhead_percent: group.input_bytes > 0
        ? ((averageEnvelope - group.input_bytes) / group.input_bytes) * 100
        : 0,
      throughput_mb_s: averageTotal > 0
        ? (group.input_bytes / (1024 * 1024)) / (averageTotal / 1000)
        : 0
    };
  });
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(aggregates) {
  const columns = [
    'fixture_id',
    'fixture_name',
    'algorithm',
    'input_bytes',
    'measured_iterations',
    'successful_iterations',
    'failed_iterations',
    'encrypt_mean_ms',
    'encrypt_median_ms',
    'encrypt_stddev_ms',
    'decrypt_mean_ms',
    'decrypt_median_ms',
    'decrypt_stddev_ms',
    'total_mean_ms',
    'total_median_ms',
    'total_stddev_ms',
    'throughput_mb_s',
    'average_envelope_bytes',
    'overhead_percent'
  ];
  const lines = [columns.join(',')];
  for (const row of aggregates) {
    lines.push([
      row.fixture_id,
      row.fixture_name,
      row.algorithm,
      row.input_bytes,
      row.measured_iterations,
      row.successful_iterations,
      row.failed_iterations,
      row.encrypt_ms.mean_ms,
      row.encrypt_ms.median_ms,
      row.encrypt_ms.stddev_ms,
      row.decrypt_ms.mean_ms,
      row.decrypt_ms.median_ms,
      row.decrypt_ms.stddev_ms,
      row.total_ms.mean_ms,
      row.total_ms.median_ms,
      row.total_ms.stddev_ms,
      row.throughput_mb_s,
      row.average_envelope_bytes,
      row.overhead_percent
    ].map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  mean,
  median,
  sampleStandardDeviation,
  applyStats,
  summarize,
  toCsv,
  csvEscape
};
