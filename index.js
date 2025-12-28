require('dotenv').config();

const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { pipeline } = require('stream/promises');
const admin = require('firebase-admin');
const { v4: uuid } = require('uuid');

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LOG_LEVEL_ORDER = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const shouldLog = (level) =>
    (LOG_LEVEL_ORDER[level] ?? LOG_LEVEL_ORDER.info) <= (LOG_LEVEL_ORDER[LOG_LEVEL] ?? LOG_LEVEL_ORDER.info);

const log = (level, message, meta = {}) => {
    if (!shouldLog(level)) return;
    const payload = { level, message, timestamp: new Date().toISOString(), ...meta };
    const line = JSON.stringify(payload);
    if (level === 'error') {
        console.error(line);
    } else {
        console.log(line);
    }
};

const logError = (message, error, meta = {}) => {
    const payload = { error: error?.message, ...meta };
    if (shouldLog('debug') && error?.stack) payload.stack = error.stack;
    log('error', message, payload);
};

const createSemaphore = (maxConcurrent) => {
    const max = Math.max(1, Number(maxConcurrent) || 1);
    let current = 0;
    const waiting = [];
    const acquire = async () => {
        if (current < max) {
            current += 1;
            return () => {
                current -= 1;
                const next = waiting.shift();
                if (next) next();
            };
        }
        await new Promise((resolve) => waiting.push(resolve));
        current += 1;
        return () => {
            current -= 1;
            const next = waiting.shift();
            if (next) next();
        };
    };
    return { acquire };
};

const withSemaphore = (semaphore, handler) => async (req, res, next) => {
    const release = await semaphore.acquire();
    try {
        await handler(req, res, next);
    } finally {
        release();
    }
};

// Prefer loading the service account from an env-provided path; fall back to local file.
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
let serviceAccount;
if (serviceAccountPath) {
    try {
        serviceAccount = require(serviceAccountPath);
    } catch (error) {
        log('error', 'Failed to load service account from path', { path: serviceAccountPath, error: error.message });
        process.exit(1);
    }
} else {
    serviceAccount = require('./photograma-c2078-firebase-adminsdk-ax4wk-d70d1dfd8e.json');
    log('warn', 'FIREBASE_SERVICE_ACCOUNT_PATH not set. Using local service account file.');
}

const DEFAULT_MAX_FILE_SIZE_MB = 5;
const maxFileSizeEnv = Number(process.env.MAX_FILE_SIZE_MB);
const MAX_FILE_SIZE = Number.isFinite(maxFileSizeEnv) && maxFileSizeEnv > 0
    ? maxFileSizeEnv * 1024 * 1024
    : DEFAULT_MAX_FILE_SIZE_MB * 1024 * 1024;
log('info', 'Configured max file size', { bytes: MAX_FILE_SIZE });

const app = express();

const imageFileFilter = (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
        return cb(null, true);
    }
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
};

const uploadTempDir = path.join(os.tmpdir(), 'photogram-backend-uploads');
try {
    fs.mkdirSync(uploadTempDir, { recursive: true });
} catch (error) {
    log('error', 'Failed to create temp upload directory', { uploadTempDir, error: error.message });
    process.exit(1);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadTempDir),
    filename: (req, file, cb) => cb(null, `${uuid()}-${Date.now()}`),
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFileFilter,
});

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'photograma-c2078.appspot.com',
});

const defaultLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Too many requests, please try again later.' }),
});

const heavyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Too many requests, please try again later.' }),
});

// Enable CORS
const allowedOrigins = new Set([
    'https://apps.andreszenteno.com', 
    'http://localhost:3000', 'http://localhost:3001', 
    'http://192.168.1.181:3000', 
    'https://192.168.1.181',
    'http://192.168.1.242:3001',
    'https://photogram.andreszenteno.com'
]);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

const multipartSizeGuard = (req, res, next) => {
    const contentLengthHeader = req.headers['content-length'];
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE) {
        return res.status(413).json({ error: 'Payload Too Large' });
    }
    next();
};

const bucket = admin.storage().bucket();
const uploadAcl = (process.env.FIREBASE_UPLOAD_ACL || 'publicRead').toLowerCase();
const usePredefinedAcl = uploadAcl !== 'none' && uploadAcl !== 'disabled';
const resizeConcurrency = Number(process.env.RESIZE_CONCURRENCY || 1);
const resizeSemaphore = createSemaphore(resizeConcurrency);

// Health check route
app.get('/health', defaultLimiter, (req, res) => {
    res.send('OK');
});

// Debug
app.get('/debug', defaultLimiter, (req, res) => {
    res.json({
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        region: process.env.VERCEL_REGION || 'local',
    });
});

// 1. Resize Service
app.post('/resize', heavyLimiter, multipartSizeGuard, upload.single('image'), withSemaphore(resizeSemaphore, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Uploaded file is not an image.' });
    }

    try {
        res.set('Content-Type', 'image/jpeg');
        await pipeline(
            fs.createReadStream(req.file.path),
            sharp().rotate().resize(1440).jpeg({ quality: 80 }),
            res,
        );
    } catch (error) {
        logError('Error resizing image', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to resize image', details: error.message });
        } else {
            res.destroy(error);
        }
    } finally {
        if (req.file?.path) {
            fs.promises.unlink(req.file.path).catch(() => {});
        }
    }
}));

// 2. Upload Service
app.post('/upload', defaultLimiter, multipartSizeGuard, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Uploaded file is not an image.' });
    }

    try {
        const mime = req.file.mimetype || 'application/octet-stream';
        const mimeToExt = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
        const ext = mimeToExt[mime] || 'bin';
        const fileName = `images/${uuid()}.${ext}`;
        const file = bucket.file(fileName);

        await pipeline(
            fs.createReadStream(req.file.path),
            file.createWriteStream({
                resumable: false,
                ...(usePredefinedAcl ? { predefinedAcl: uploadAcl } : {}),
                metadata: {
                    contentType: mime,
                    cacheControl: 'public,max-age=31536000,immutable',
                },
            }),
        );

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        res.json({ url: publicUrl });
    } catch (error) {
        logError('Error uploading to Firebase Storage', error);
        res.status(500).json({ error: 'Failed to upload image to Firebase', details: error.message });
    } finally {
        if (req.file?.path) {
            fs.promises.unlink(req.file.path).catch(() => {});
        }
    }
});

// 3. Resize-Upload Service
app.post('/resize-upload', heavyLimiter, multipartSizeGuard, upload.single('image'), withSemaphore(resizeSemaphore, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
    }

    log('info', 'Received file for resize-upload', { filename: req.file.originalname });

    // Check if the uploaded file is an image
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: `Uploaded file is not an image. Mimetype: ${req.file.mimetype}` });
    }

    try {
        const fileName = `images/${uuid()}.jpg`;
        // Log the file name and metadata being saved
        log('info', 'Uploading resized image', { fileName });

        const file = bucket.file(fileName);

        await pipeline(
            fs.createReadStream(req.file.path),
            sharp().rotate().resize(1440).jpeg({ quality: 80 }),
            file.createWriteStream({
                resumable: false,
                ...(usePredefinedAcl ? { predefinedAcl: uploadAcl } : {}),
                metadata: {
                    contentType: 'image/jpeg',
                    cacheControl: 'public,max-age=31536000,immutable',
                },
            }),
        );
        log('info', 'Image uploaded to Firebase Storage', { fileName });

        // Get the public URL of the uploaded file
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        res.json({ url: publicUrl });

    } catch (error) {
        logError('Error uploading image', error);
        res.status(500).json({ error: 'Failed to upload image', details: error.message });
    } finally {
        if (req.file?.path) {
            fs.promises.unlink(req.file.path).catch(() => {});
        }
    }
}));

// 4. Delete Service
app.post(
    '/delete-image',
    defaultLimiter,
    express.json({ limit: '2kb' }),
    express.urlencoded({ extended: true, limit: '2kb' }),
    async (req, res) => {
    try {
        const { imgName } = req.body;

        if (!imgName) {
            return res.status(400).send('Image name is required');
        }

        const file = bucket.file(`images/${imgName}`);

        // Delete the file from Firebase Storage
        await file.delete();
        log('info', 'File deleted from Firebase Storage', { imgName });

        return res.status(200).send('File successfully deleted');
    } catch (error) {
        logError('Error deleting file from Firebase Storage', error);
        return res.status(500).send('Failed to delete the image');
    }
});

// Start the backend server
const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
    log('info', 'Server is running', { port });
});

// Multer error handler to return clean 400s on bad uploads
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        log('warn', 'Multer error on upload', { error: err.message });
        return res.status(400).json({ error: err.message });
    }
    return next(err);
});

// Fallback error handler
app.use((err, req, res, next) => {
    logError('Unhandled server error', err);
    return res.status(500).json({ error: 'Internal server error' });
});
