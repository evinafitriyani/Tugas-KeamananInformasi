# 🛡️ CipherDock - Secure File Storage Web Application

> **Tugas Mata Kuliah Keamanan Informasi**  
> Implementasi Algoritma Kriptografi (AES, DES, RC4) dan Analisis Performa Kinerja

---

## 📖 Tentang Proyek
Aplikasi web penyimpanan file aman berbasis **Node.js** yang dirancang untuk memenuhi standar privasi data (seperti GDPR / UU PDP) dengan memastikan seluruh file privat pengguna (dokumen, gambar ID, PDF) terenkripsi secara aman sebelum disimpan ke dalam server. Dilengkapi dengan antarmuka modern dua kolom ala *CipherDock* yang mendukung *Light/Dark Mode*.

---

## Fitur Utama
1. **Autentikasi Pengguna:** Sistem Login & Register dengan penyimpanan data aman menggunakan SQLite.
2. **Multi-Algoritma Kriptografi (Non-ECB Mode):**
   - **AES-256-CBC** (dengan *Initialization Vector* / IV acak)
   - **DES-CBC** (dengan *Initialization Vector* / IV acak)
   - **RC4** (*Stream Cipher*)
3. **Manajemen File & Analisis Kinerja:**
   - **Upload & Enkripsi:** Mengunggah file apa pun dan otomatis mengenkripsinya.
   - **Running Time Analysis:** Mengukur waktu eksekusi enkripsi secara presisi dalam satuan milidetik (ms).
   - **Download Enkripsi (.enc):** Mengunduh file mentah hasil ciphertext untuk dibagikan atau diuji pihak lain.
   - **Download & Dekripsi:** Mengembalikan file terenkripsi milik sendiri menjadi file asli yang normal.
   - **Dekripsi Eksternal:** Fitur untuk membuka file `.enc` kiriman luar menggunakan kunci rahasia yang sesuai.

---

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** SQLite3
- **Kriptografi:** Node.js `crypto` module & `crypto-js`
- **Frontend:** HTML5, CSS3 (CipherDock UI Theme with Light/Dark Toggle), JavaScript

---

## Cara Menjalankan Program (Local)

1. Clone atau download repository ini ke komputer Anda.
2. Buka terminal pada folder utama project, lalu instal dependensi yang diperlukan:
   ```bash
   npm install