'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const serverApp = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');
const fileRoutes = fs.readFileSync(path.join(root, 'server', 'routes', 'files.js'), 'utf8');

test('branding, batas unggah, dan peringatan algoritma tampil di UI', () => {
  assert.match(html, /<title>CampusVault/);
  assert.match(html, /CampusVault adalah aplikasi penyimpanan privat untuk dokumen organisasi kampus/);
  assert.match(html, /AES digunakan sebagai pilihan utama/);
  assert.match(html, /DES dan RC4 tersedia hanya untuk perbandingan akademik/);
  assert.match(html, /Gunakan hanya data dummy untuk demonstrasi/);
  assert.match(html, /prototipe akademik/);
  assert.match(html, /bukan layanan produksi atau klaim kepatuhan hukum/);
  assert.match(html, /25 MiB/);
  assert.match(html, /\.csv,\.pdf,\.jpg,\.jpeg,\.png,\.docx,\.xlsx,\.pptx,\.mp4,\.webm/);
  assert.match(html, /id="cipher-warning"/);
  assert.match(html, /DES-CBC dan RC4 hanya tersedia/);
  assert.match(html, /tidak aman untuk data/);
});

test('tidak ada UI dekripsi eksternal atau endpoint terkait', () => {
  assert.doesNotMatch(html, /dekripsi eksternal/i);
  assert.doesNotMatch(appJs, /decrypt-external/i);
  assert.doesNotMatch(fileRoutes, /decrypt-external/i);
});

test('nama file dirender sebagai teks dan tidak memakai innerHTML', () => {
  assert.doesNotMatch(appJs, /\.innerHTML\s*=/);
  assert.doesNotMatch(appJs, /insertAdjacentHTML/);
  assert.match(appJs, /node\.textContent = String\(text\)/);
  assert.match(appJs, /element\('strong', 'file-name', file\.original_filename\)/);
  assert.match(appJs, /replaceChildren/);
});

test('status autentikasi berasal dari server, bukan variabel klien saja', () => {
  assert.match(appJs, /api\('\/api\/auth\/me'\)/);
  assert.doesNotMatch(appJs, /localStorage/);
  assert.doesNotMatch(appJs, /sessionStorage/);
  assert.match(html, /id="app-view"[^>]*hidden/);
  assert.match(html, /id="user-area"[^>]*hidden/);
  assert.match(appJs, /appView\.hidden = !state\.user/);
});

test('UI benchmark memakai field hasil nyata dan memiliki empty state', () => {
  assert.match(appJs, /Belum ada hasil benchmark\. Jalankan npm run benchmark\./);
  for (const field of [
    'encrypt_ms',
    'decrypt_ms',
    'encrypt_throughput_mib_s',
    'decrypt_throughput_mib_s',
    'average_envelope_bytes',
    'overhead_percent',
    'round_trip_correct'
  ]) {
    assert.ok(appJs.includes(field), field);
  }
  assert.match(appJs, /report\.environment/);
  assert.match(appJs, /methodology\.warmup_iterations/);
  assert.match(appJs, /methodology\.measured_iterations/);
  assert.doesNotMatch(appJs, /\b(?:123\.45|987\.65)\b/);
});

test('storage privat tidak disajikan sebagai static content', () => {
  assert.doesNotMatch(serverApp, /express\.static\([^)]*(?:storage|upload|enc_storage)/);
  assert.match(serverApp, /express\.static\(config\.publicDir/);
});
