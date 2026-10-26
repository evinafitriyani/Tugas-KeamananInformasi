const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const { performance } = require('perf_hooks');

const app = express();
const PORT = 3000;

const uploadDir = path.join(__dirname, 'uploads');
const encDir = path.join(__dirname, 'enc_storage');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(encDir)) fs.mkdirSync(encDir, { recursive: true });

const upload = multer({ dest: uploadDir });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Gagal terhubung ke database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// Helper Fungsi untuk Hashing Password dengan Salt Aman
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash: `${salt}:${hash}` };
}

function verifyPassword(password, storedHash) {
    const [salt, originalHash] = storedHash.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return hash === originalHash;
}

// Helper Hitung SHA-256 untuk Integritas File
function calculateSHA256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        filename TEXT,
        encrypted_filename TEXT,
        algorithm TEXT,
        execution_time REAL,
        file_hash TEXT
    )`);
});

// Endpoint Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi.' });

    const { hash } = hashPassword(password);
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hash], (err) => {
        if (err) return res.status(400).json({ message: 'Username sudah terdaftar atau gagal.' });
        res.json({ message: `Akun baru berhasil dibuat: ${username}!` });
    });
});

// Endpoint Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
        if (err) return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
        if (!row || !verifyPassword(password, row.password)) {
            return res.status(400).json({ message: 'Username atau password salah!' });
        }
        res.json({ message: `Login berhasil! Selamat datang, ${username}.` });
    });
});

// Endpoint Upload & Enkripsi Beserta Waktu Eksekusi & SHA-256
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        const { username, algorithm } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ message: 'Tidak ada file yang di-upload.' });

        const filePath = file.path;
        const fileBuffer = fs.readFileSync(filePath);
        const originalHash = calculateSHA256(fileBuffer);
        
        let encryptedData = '';
        const secretKey = 'kunci-rahasia-kampus';

        const startTime = performance.now();

        if (algorithm === 'aes') {
            const iv = crypto.randomBytes(16);
            const key = crypto.scryptSync(secretKey, 'salt', 32);
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            let encrypted = cipher.update(fileBuffer);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            // Menyertakan hash asli di dalam payload terenkripsi untuk cek integritas
            encryptedData = iv.toString('hex') + ':' + originalHash + ':' + encrypted.toString('hex');
        } else if (algorithm === 'des') {
            const iv = crypto.randomBytes(8);
            const key = crypto.scryptSync(secretKey, 'salt', 8);
            const cipher = crypto.createCipheriv('des-cbc', key, iv);
            let encrypted = cipher.update(fileBuffer);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            encryptedData = iv.toString('hex') + ':' + originalHash + ':' + encrypted.toString('hex');
        } else if (algorithm === 'rc4') {
            const payload = originalHash + '::' + fileBuffer.toString('base64');
            const encrypted = CryptoJS.RC4.encrypt(payload, secretKey).toString();
            encryptedData = encrypted;
        }

        const endTime = performance.now();
        const executionTime = (endTime - startTime).toFixed(3);

        const encryptedFileName = 'enc_' + Date.now() + '_' + file.originalname + '.enc';
        const encryptedPath = path.join(encDir, encryptedFileName);
        
        fs.writeFileSync(encryptedPath, encryptedData);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        db.run(`INSERT INTO files (username, filename, encrypted_filename, algorithm, execution_time, file_hash) VALUES (?, ?, ?, ?, ?, ?)`,
            [username || 'guest', file.originalname, encryptedFileName, algorithm.toUpperCase(), executionTime, originalHash],
            (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: 'Gagal menyimpan ke database.' });
                }
                res.json({ message: `File berhasil dienkripsi (${algorithm.toUpperCase()}) dalam ${executionTime} ms! 🔒 (SHA-256: ${originalHash.substring(0, 10)}...)` });
            }
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan saat enkripsi.' });
    }
});

// Endpoint Ambil Daftar File
app.get('/api/files', (req, res) => {
    const { username } = req.query;
    db.all(`SELECT * FROM files WHERE username = ?`, [username], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Gagal mengambil data.' });
        res.json(rows);
    });
});

// Endpoint Download & Dekripsi File Milik Sendiri + Validasi Integritas SHA-256
app.get('/api/decrypt/:id', (req, res) => {
    const fileId = req.params.id;
    db.get(`SELECT * FROM files WHERE id = ?`, [fileId], (err, row) => {
        if (err || !row) return res.status(404).send('File tidak ditemukan.');

        const encryptedPath = path.join(encDir, row.encrypted_filename);
        if (!fs.existsSync(encryptedPath)) return res.status(404).send('File fisik terenkripsi tidak ditemukan.');

        const encryptedData = fs.readFileSync(encryptedPath, 'utf8');
        const secretKey = 'kunci-rahasia-kampus';
        let decryptedBuffer;
        let verifiedHash = '';

        try {
            if (row.algorithm === 'AES') {
                const parts = encryptedData.split(':');
                const iv = Buffer.from(parts[0], 'hex');
                const storedOriginalHash = parts[1];
                const encryptedText = Buffer.from(parts[2], 'hex');
                
                const key = crypto.scryptSync(secretKey, 'salt', 32);
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                decryptedBuffer = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
                verifiedHash = calculateSHA256(decryptedBuffer);
            } else if (row.algorithm === 'DES') {
                const parts = encryptedData.split(':');
                const iv = Buffer.from(parts[0], 'hex');
                const storedOriginalHash = parts[1];
                const encryptedText = Buffer.from(parts[2], 'hex');
                
                const key = crypto.scryptSync(secretKey, 'salt', 8);
                const decipher = crypto.createDecipheriv('des-cbc', key, iv);
                decryptedBuffer = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
                verifiedHash = calculateSHA256(decryptedBuffer);
            } else if (row.algorithm === 'RC4') {
                const bytes = CryptoJS.RC4.decrypt(encryptedData, secretKey);
                const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
                const parts = decryptedString.split('::');
                const storedOriginalHash = parts[0];
                decryptedBuffer = Buffer.from(parts[1], 'base64');
                verifiedHash = calculateSHA256(decryptedBuffer);
            }

            // Cek Integritas SHA-256
            if (verifiedHash !== row.file_hash) {
                console.warn('Peringatan: Integritas file gagal! Hash tidak cocok.');
            }

            res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
            res.send(decryptedBuffer);

        } catch (error) {
            console.error(error);
            res.status(500).send('Gagal melakukan dekripsi file.');
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});