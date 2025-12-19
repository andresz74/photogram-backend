require('dotenv').config();

const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const Jimp = require('jimp');
const admin = require('firebase-admin');
const { v4: uuid } = require('uuid');

const log = (level, message, meta = {}) => {
    const payload = { level, message, timestamp: new Date().toISOString(), ...meta };
    const line = JSON.stringify(payload);
    if (level === 'error') {
        console.error(line);
    } else {
        console.log(line);
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const imageFileFilter = (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
        return cb(null, true);
    }
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFileFilter,
});

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'photograma-c2078.appspot.com',
});

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Too many requests, please try again later.' }),
});

// Enable CORS
const allowedOrigins = ['https://apps.andreszenteno.com', 'http://localhost:3000', 'http://192.168.1.181:3000', 'https://192.168.1.181'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

app.use(limiter);

app.use((req, res, next) => {
    const contentLengthHeader = req.headers['content-length'];
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE) {
        return res.status(413).json({ error: 'Payload Too Large' });
    }
    next();
});

const bucket = admin.storage().bucket();

// Health check route
app.get('/health', (req, res) => {
    res.send('OK');
});

// Debug
app.get('/debug', (req, res) => {
    res.json({
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        region: process.env.VERCEL_REGION || 'local',
    });
});

// 1. Resize Service
app.post('/resize', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Uploaded file is not an image.' });
    }

    try {
        const fileBuffer = req.file.buffer;

        // Load and process the image
        const image = await Jimp.read(fileBuffer);
        image.resize(1440, Jimp.AUTO);  // Resize to 1440px width
        image.quality(80);  // Set JPEG quality to 80%

        // Get the resized image buffer
        const resizedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

        res.set('Content-Type', 'image/jpeg');
        res.send(resizedBuffer); // Send the resized image buffer
    } catch (error) {
        log('error', 'Error resizing image', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to resize image', details: error.message });
    }
});

// 2. Upload Service
app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Uploaded file is not an image.' });
    }

    try {
        const fileBuffer = req.file.buffer;

        const fileName = `images/${uuid()}.jpg`;
        const file = bucket.file(fileName);

        // Upload the image to Firebase Storage
        await file.save(fileBuffer, {
            metadata: {
                contentType: req.file.mimetype,
                cacheControl: 'public,max-age=31536000,immutable',
            },
            public: true,
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        res.json({ url: publicUrl });
    } catch (error) {
        log('error', 'Error uploading to Firebase Storage', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to upload image to Firebase', details: error.message });
    }
});

// 3. Resize-Upload Service
app.post('/resize-upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
    }

    log('info', 'Received file for resize-upload', { filename: req.file.originalname });

    // Check if the uploaded file is an image
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: `Uploaded file is not an image. Mimetype: ${req.file.mimetype}` });
    }

    try {
        log('info', 'Incoming file buffer length', { bytes: req.file.buffer.length });

        const fileBuffer = req.file.buffer;

        // Load image using Jimp from buffer
        let image;
        try {
            image = await Jimp.read(fileBuffer);
        } catch (error) {
            log('error', 'Error reading image with Jimp', { error: error.message, stack: error.stack });
            return res.status(500).json({ error: 'Failed to read image', details: error.message });
        }

        // Resize and compress the image
        image.resize(1440, Jimp.AUTO);  // Resize to 1440px width, keep aspect ratio
        image.quality(80);  // Set JPEG quality to 80%

        // Convert the image back to buffer
        const compressedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

        const fileName = `images/${uuid()}.jpg`;
        // Log the file name and metadata being saved
        log('info', 'Uploading resized image', { fileName });

        const file = bucket.file(fileName);

        // Upload the compressed image to Firebase Storage
        try {
            await file.save(compressedBuffer, {
                metadata: {
                    contentType: 'image/jpeg',
                    cacheControl: 'public,max-age=31536000,immutable',
                },
                public: true,
            });
            log('info', 'Image uploaded to Firebase Storage', { fileName });
        } catch (error) {
            log('error', 'Error uploading to Firebase Storage', { error: error.message, stack: error.stack });
            return res.status(500).json({ error: 'Failed to upload image to Firebase', details: error.message });
        }

        // Get the public URL of the uploaded file
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        res.json({ url: publicUrl });

    } catch (error) {
        log('error', 'Error uploading image', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to upload image', details: error.message });
    }
});

// 4. Delete Service
app.post('/delete-image', async (req, res) => {
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
        log('error', 'Error deleting file from Firebase Storage', { error: error.message, stack: error.stack });
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
    log('error', 'Unhandled server error', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Internal server error' });
});
