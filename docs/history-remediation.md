# Remediasi Riwayat Git CampusVault

Dokumen ini menjelaskan prosedur **terkoordinasi** untuk menghapus data runtime, dokumen personal, `node_modules`, database, dan secret lama dari riwayat Git. Prosedur ini tidak dijalankan otomatis oleh agen dan tidak boleh dilakukan tanpa persetujuan seluruh kolaborator.

> **Penting:** kunci/master secret lama harus dianggap **kompromi permanen**. Membuat secret baru tidak menghapus salinan lama dari riwayat, fork, cache, atau backup. Jangan pernah memakai ulang secret lama.

## 1. Kondisi Saat Ini

- Data runtime dan ciphertext lama sudah dihapus dari **working tree dan index**.
- `.gitignore` sudah mencegah data runtime, `.env`, `node_modules`, dan output benchmark masuk kembali.
- Namun commit lama masih dapat memuat path dan secret tersebut.
- Rewrite riwayat belum dilakukan karena membutuhkan koordinasi, force-push, dan re-clone semua kolaborator.
- Remote saat ini memiliki riwayat lama; jangan menganggap repository aman hanya karena tree terbaru sudah bersih.

Kategori yang harus dibersihkan dari riwayat:

- `node_modules/`
- `server/enc_storage/` (ciphertext runtime lama)
- `server/uploads/` (file runtime/plaintext lama)
- `server/database.sqlite` dan file SQLite runtime lain
- `server/data/` bila pernah dilacak
- `benchmark/results/`
- `.env` dan file environment lokal lain, kecuali `.env.example`
- log, coverage, dan artefak build
- literal secret lama yang tertanam di source atau test
- dokumen personal/plaintext lain yang pernah dilacak

Jangan menyalin nama file personal atau nilai secret ke dokumen ini, issue, chat, atau commit message. Cukup catat path/kategori dan koordinasikan nilai secret melalui kanal aman.

## 2. Prasyarat dan Peringatan

1. **Bekukan semua push, merge, dan tag** sampai rewrite selesai.
2. Beri tahu seluruh kolaborator. Setelah rewrite, commit hash berubah dan clone lama tidak lagi kompatibel.
3. Siapkan **backup mirror** di lokasi aman sebelum menjalankan apa pun.
4. Pastikan secret lama sudah dicabut/diganti di semua lingkungan.
5. Gunakan clone baru khusus rewrite; jangan menjalankan `git filter-repo` pada working tree yang berisi pekerjaan belum di-commit.
6. Force-push hanya setelah verifikasi dan persetujuan eksplisit. Jangan force-push otomatis dari agen.
7. Periksa juga fork, pull request ref, Actions cache/artifact, release asset, dan backup pihak ketiga. Objek di GitHub dapat tetap dapat diakses melalui ref/cache tertentu sampai dibersihkan.
8. Jika organisasi memakai branch protection, siapkan izin force-push sementara dan pulihkan setelah selesai.

## 3. Backup

Buat mirror clone dan bundle sebelum rewrite:

```bash
git clone --mirror <repository-url> campusvault-history-backup.git
cd campusvault-history-backup.git
git bundle create ../campusvault-pre-rewrite.bundle --all
```

Simpan backup di tempat aman dengan akses terbatas. Backup ini masih memuat data sensitif; jangan mengunggahnya ke layanan publik.

## 4. Siapkan Clone Rewrite

Gunakan clone mirror baru, bukan working tree aplikasi:

```bash
git clone --mirror <repository-url> campusvault-history-rewrite.git
cd campusvault-history-rewrite.git
```

Pasang `git filter-repo`:

```bash
python -m pip install --user git-filter-repo
# atau
pipx install git-filter-repo
```

Di Windows, jika `python` tidak tersedia, gunakan `py -m pip install --user git-filter-repo`.

`git filter-repo` biasanya menghapus remote `origin` untuk mencegah push tidak sengaja. Remote akan ditambahkan kembali secara eksplisit pada langkah force-push.

## 5. Hapus Path Sensitif

Periksa dulu path yang ada di riwayat tanpa mencetak nama file personal:

```bash
git log --all --name-only --pretty=format: \
  | sed '/^$/d' \
  | sort -u \
  | grep -E '^(server/enc_storage/|server/uploads/|server/data/|node_modules/|benchmark/results/)|(^|/)\.env($|\.)|\.sqlite$'
```

Jalankan rewrite path:

```bash
git filter-repo --force --invert-paths \
  --path node_modules/ \
  --path server/enc_storage/ \
  --path server/uploads/ \
  --path server/data/ \
  --path server/database.sqlite \
  --path benchmark/results/ \
  --path .env
```

Tambahkan path lain yang ditemukan pada pemeriksaan, misalnya database runtime di root atau folder upload lama. Jangan menambahkan `benchmark/fixtures/`, karena empat fixture dummy tersebut memang bagian dari aplikasi.

Jika `.env` pernah dilacak dengan nama lain, tambahkan path eksplisit tersebut. Jangan memakai pola yang menghapus `.env.example`.

## 6. Hapus Literal Secret dari Isi File

Path removal tidak cukup jika secret lama tertanam di source code yang tetap dipertahankan. Siapkan file replacement **di luar repository** dan jangan commit file tersebut:

```text
literal:NILAI_SECRET_LAMA==>***REMOVED***
```

Contoh lokasi aman: direktori sementara pribadi atau password manager. Jangan menuliskan nilai secret di shell history bersama, issue, atau dokumen ini.

Jalankan:

```bash
git filter-repo --force \
  --replace-text /path/aman/replacements.txt \
  --invert-paths \
  --path node_modules/ \
  --path server/enc_storage/ \
  --path server/uploads/ \
  --path server/data/ \
  --path server/database.sqlite \
  --path benchmark/results/ \
  --path .env
```

Alternatif: gunakan `--replace-text` pada clone terpisah setelah path removal, lalu verifikasi hasilnya. Jika secret lama juga muncul di pesan commit, gunakan `--replace-message` dengan file replacement terpisah dan periksa hasilnya secara manual.

Setelah rewrite, secret lama tetap dianggap kompromi. Ganti semua token, password database, kredensial layanan, dan master key yang mungkin pernah terekspos.

## 7. Verifikasi Sebelum Push

### 7.1 Pastikan path sensitif hilang

```bash
git log --all --name-only --pretty=format: \
  | sed '/^$/d' \
  | sort -u \
  | grep -E '^(server/enc_storage/|server/uploads/|server/data/|node_modules/|benchmark/results/)|(^|/)\.env($|\.)|\.sqlite$'
```

Perintah harus menghasilkan **tidak ada output**. Jika masih ada, jangan lanjut ke force-push.

### 7.2 Periksa isi commit

```bash
git log --all --oneline -- server/enc_storage server/uploads server/database.sqlite node_modules
```

Perintah harus menghasilkan tidak ada output.

### 7.3 Jalankan secret scan

Gunakan minimal satu scanner yang memindai riwayat, bukan hanya working tree:

```bash
gitleaks detect --source . --log-opts="--all" --no-banner
```

atau:

```bash
trufflehog git file://. --only-verified
```

Tinjau setiap temuan. False positive harus didokumentasikan; temuan secret nyata harus diperbaiki sebelum push. Jangan menjalankan scanner dengan opsi yang mengunggah data sensitif ke layanan pihak ketiga tanpa persetujuan.

### 7.4 Periksa ukuran dan object

```bash
git count-objects -vH
git rev-list --objects --all | wc -l
```

Penurunan ukuran membantu, tetapi bukan bukti bahwa semua data sensitif hilang. Verifikasi path dan secret scan tetap wajib.

## 8. Force-Push Terkoordinasi

Langkah ini **mengubah riwayat remote** dan hanya boleh dijalankan setelah verifikasi serta persetujuan.

```bash
git remote add origin <repository-url>
git push --force --all origin
git push --force --tags origin
```

Jangan memakai `git push --mirror` kecuali benar-benar memahami bahwa ref yang tidak ada di lokal dapat terhapus di remote.

Setelah push:

1. Pulihkan branch protection dan izin yang sempat dilonggarkan.
2. Minta GitHub/GitLab membersihkan ref pull request lama, cache, dan salinan objek bila diperlukan. Untuk GitHub, hubungi Support jika commit sensitif masih dapat diakses melalui URL commit/PR.
3. Periksa kembali tab commit, network, dan pull request di web.
4. Ingat bahwa fork dan clone kolaborator tetap menyimpan salinan lama.

## 9. Tindakan Kolaborator

Cara paling aman adalah **re-clone** repository setelah rewrite:

```bash
git clone <repository-url> secure-file-app-baru
cd secure-file-app-baru
npm ci
```

Jika re-clone tidak memungkinkan, simpan pekerjaan lokal sebagai patch terlebih dahulu, lalu reset dengan hati-hati:

```bash
git status
git stash push -u -m "pekerjaan-sebelum-rewrite"
git fetch origin
git reset --hard origin/<nama-branch>
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

Reset `--hard` menghapus perubahan lokal yang tidak disimpan. Jangan jalankan tanpa backup. Setelah reset, reflog dan object lama juga harus dibersihkan agar salinan lokal tidak tertinggal.

## 10. Pencegahan Ke Depan

- Pertahankan `.gitignore` untuk `.env`, `server/data/`, `server/enc_storage/`, `server/uploads/`, database runtime, `node_modules/`, log, coverage, dan `benchmark/results/`.
- Gunakan secret manager atau environment lokal, bukan literal di source.
- Aktifkan secret scanning dan push protection pada remote bila tersedia.
- Tambahkan pre-commit hook untuk mendeteksi secret dan file runtime.
- Jalankan `git status --short` dan `git ls-files` sebelum commit.
- Tinjau dependency dan lockfile secara berkala.
- Rotasi master key/session secret secara berkala; jangan menyalin secret antar lingkungan.
- Untuk tugas akademik, gunakan hanya data dummy dan dokumentasikan bahwa benchmark dijalankan sendiri.

## 11. Status yang Harus Dilaporkan

Saat remediasi selesai, laporkan:

- tanggal dan pelaksana rewrite;
- URL backup yang aman (jangan bagikan isinya);
- path/kategori yang dihapus, tanpa nama file personal atau nilai secret;
- hasil secret scan (jumlah temuan dan status penyelesaian);
- hash commit baru untuk branch yang dipakai;
- konfirmasi semua kolaborator sudah re-clone/reset;
- konfirmasi secret lama sudah dicabut dan tidak dipakai ulang;
- sisa risiko: fork, cache, PR ref, backup, atau clone lama yang belum dibersihkan.
