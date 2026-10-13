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
        execution_time REAL
    )`);
});

// Endpoint Login / Register
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
        if (err) return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });

        if (row) {
            if (row.password === password) {
                res.json({ message: `Login berhasil! Selamat datang, ${username}.` });
            } else {
                res.status(400).json({ message: 'Password salah!' });
            }
        } else {
            db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], (err) => {
                if (err) return res.status(500).json({ message: 'Gagal mendaftarkan akun.' });
                res.json({ message: `Akun baru dibuat: ${username}!` });
            });
        }
    });
});

// Endpoint Upload & Enkripsi Beserta Waktu Eksekusi (Running Time)
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        const { username, algorithm } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ message: 'Tidak ada file yang di-upload.' });

        const filePath = file.path;
        const fileBuffer = fs.readFileSync(filePath);
        let encryptedData = '';
        const secretKey = 'kunci-rahasia-kampus';

        // Mulai mencatat waktu eksekusi enkripsi
        const startTime = performance.now();

        if (algorithm === 'aes') {
            const iv = crypto.randomBytes(16);
            const key = crypto.scryptSync(secretKey, 'salt', 32);
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            let encrypted = cipher.update(fileBuffer);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            encryptedData = iv.toString('hex') + ':' + encrypted.toString('hex');
        } else if (algorithm === 'des') {
            const iv = crypto.randomBytes(8);
            const key = crypto.scryptSync(secretKey, 'salt', 8);
            const cipher = crypto.createCipheriv('des-cbc', key, iv);
            let encrypted = cipher.update(fileBuffer);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            encryptedData = iv.toString('hex') + ':' + encrypted.toString('hex');
        } else if (algorithm === 'rc4') {
            const wordArray = CryptoJS.lib.WordArray.create(fileBuffer);
            const encrypted = CryptoJS.RC4.encrypt(wordArray, secretKey).toString();
            encryptedData = encrypted;
        }

        const endTime = performance.now();
        const executionTime = (endTime - startTime).toFixed(3); // Menghitung selisih waktu dalam milidetik

        const encryptedFileName = 'enc_' + Date.now() + '_' + file.originalname + '.enc';
        const encryptedPath = path.join(encDir, encryptedFileName);
        
        fs.writeFileSync(encryptedPath, encryptedData);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        db.run(`INSERT INTO files (username, filename, encrypted_filename, algorithm, execution_time) VALUES (?, ?, ?, ?, ?)`,
            [username || 'guest', file.originalname, encryptedFileName, algorithm.toUpperCase(), executionTime],
            (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: 'Gagal menyimpan ke database.' });
                }
                res.json({ message: `File berhasil dienkripsi (${algorithm.toUpperCase()}) dalam ${executionTime} ms! 🔒` });
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

// Endpoint Download File Mentah Terenkripsi (.enc)
app.get('/api/download-enc/:id', (req, res) => {
    const fileId = req.params.id;
    db.get(`SELECT * FROM files WHERE id = ?`, [fileId], (err, row) => {
        if (err || !row) return res.status(404).send('File tidak ditemukan.');
        const encryptedPath = path.join(encDir, row.encrypted_filename);
        if (!fs.existsSync(encryptedPath)) return res.status(404).send('File fisik tidak ditemukan.');
        res.download(encryptedPath, row.filename + '.enc');
    });
});

// Endpoint Download & Dekripsi File Milik Sendiri
app.get('/api/decrypt/:id', (req, res) => {
    const fileId = req.params.id;
    db.get(`SELECT * FROM files WHERE id = ?`, [fileId], (err, row) => {
        if (err || !row) return res.status(404).send('File tidak ditemukan.');

        const encryptedPath = path.join(encDir, row.encrypted_filename);
        if (!fs.existsSync(encryptedPath)) return res.status(404).send('File fisik terenkripsi tidak ditemukan.');

        const encryptedData = fs.readFileSync(encryptedPath, 'utf8');
        const secretKey = 'kunci-rahasia-kampus';
        let decryptedBuffer;

        try {
            if (row.algorithm === 'AES') {
                const parts = encryptedData.split(':');
                const iv = Buffer.from(parts[0], 'hex');
                const encryptedText = Buffer.from(parts[1], 'hex');
                const key = crypto.scryptSync(secretKey, 'salt', 32);
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                decryptedBuffer = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
            } else if (row.algorithm === 'DES') {
                const parts = encryptedData.split(':');
                const iv = Buffer.from(parts[0], 'hex');
                const encryptedText = Buffer.from(parts[1], 'hex');
                const key = crypto.scryptSync(secretKey, 'salt', 8);
                const decipher = crypto.createDecipheriv('des-cbc', key, iv);
                decryptedBuffer = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
            } else if (row.algorithm === 'RC4') {
                const bytes = CryptoJS.RC4.decrypt(encryptedData, secretKey);
                const latin1String = bytes.toString(CryptoJS.enc.Latin1);
                decryptedBuffer = Buffer.from(latin1String, 'binary');
            }

            res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
            res.send(decryptedBuffer);

        } catch (error) {
            console.error(error);
            res.status(500).send('Gagal melakukan dekripsi file.');
        }
    });
});

// Endpoint Dekripsi File Luar (Eksternal)
app.post('/api/decrypt-external', upload.single('file'), (req, res) => {
    try {
        const { algorithm, secretKey } = req.body;
        const file = req.file;

        if (!file || !secretKey) {
            return res.status(400).json({ message: 'File dan kunci rahasia wajib diisi!' });
        }

        const encryptedData = fs.readFileSync(file.path, 'utf8');
        let decryptedBuffer;

        if (algorithm === 'aes') {
            const parts = encryptedData.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encryptedText = Buffer.from(parts[1], 'hex');
            const key = crypto.scryptSync(secretKey, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            decryptedBuffer = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
        } else if (algorithm === 'des') {
            const parts = encryptedData.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encryptedText = Buffer.from(parts[1], 'hex');
            const key = crypto.scryptSync(secretKey, 'salt', 8);
            const decipher = crypto.createDecipheriv('des-cbc', key, iv);
            decryptedBuffer = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
        } else if (algorithm === 'rc4') {
            const bytes = CryptoJS.RC4.decrypt(encryptedData, secretKey);
            const latin1String = bytes.toString(CryptoJS.enc.Latin1);
            decryptedBuffer = Buffer.from(latin1String, 'binary');
        }

        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

        res.setHeader('Content-Disposition', `attachment; filename="decrypted_file"`);
        res.send(decryptedBuffer);

    } catch (error) {
        console.error(error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: 'Dekripsi gagal! Periksa kembali algoritma dan kunci rahasia Anda.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});