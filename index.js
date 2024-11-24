require('dotenv').config();

const cors = require('cors');
const express = require('express');
const multer = require('multer');
const Jimp = require('jimp');
const admin = require('firebase-admin');
const serviceAccount = require('./photograma-c2078-firebase-adminsdk-ax4wk-d70d1dfd8e.json');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024;
console.log(`Max file size allowed: ${MAX_FILE_SIZE} bytes`);

const app = express();
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
});

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'photograma-c2078.appspot.com',
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

app.use((req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength > MAX_FILE_SIZE) {
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
        console.error('Error resizing image:', error);
        res.status(500).json({ error: 'Failed to resize image', details: error.message });
    }
});

// 2. Upload Service
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        const fileBuffer = req.file.buffer;

        const fileName = `images/${Date.now()}-${req.file.originalname}`;
        const file = bucket.file(fileName);

        // Upload the image to Firebase Storage
        await file.save(fileBuffer, {
            metadata: { contentType: 'image/jpeg' },
            public: true,
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        res.json({ url: publicUrl });
    } catch (error) {
        console.error('Error uploading to Firebase Storage:', error);
        res.status(500).json({ error: 'Failed to upload image to Firebase', details: error.message });
    }
});

// 3. Resize-Upload Service
app.post('/resize-upload', upload.single('image'), async (req, res) => {
    console.log('Received file:', req.file.originalname);

    // Check if the uploaded file is an image
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: `Uploaded file is not an image. Mimetype: ${req.file.mimetype}` });
    }

    try {
        console.log(req.file.buffer.length);

        const fileBuffer = req.file.buffer;

        // Load image using Jimp from buffer
        let image;
        try {
            image = await Jimp.read(fileBuffer);
        } catch (error) {
            console.error('Error reading image with Jimp:', error);
            return res.status(500).json({ error: 'Failed to read image', details: error.message });
        }

        // Resize and compress the image
        image.resize(1440, Jimp.AUTO);  // Resize to 1440px width, keep aspect ratio
        image.quality(80);  // Set JPEG quality to 80%

        // Convert the image back to buffer
        const compressedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

        const fileName = `images/${Date.now()}-${req.file.originalname}`;
        // Log the file name and metadata being saved
        console.log('File name:', fileName);

        const file = bucket.file(fileName);

        // Upload the compressed image to Firebase Storage
        try {
            await file.save(compressedBuffer, {
                metadata: { contentType: 'image/jpeg' },
                public: true,
            });
            console.log(`Image uploaded to Firebase Storage as ${fileName}`);
        } catch (error) {
            console.error('Error uploading to Firebase Storage:', error);
            return res.status(500).json({ error: 'Failed to upload image to Firebase', details: error.message });
        }

        // Get the public URL of the uploaded file
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        res.json({ url: publicUrl });

    } catch (error) {
        console.error('Error uploading image:', error);
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
        console.log(`File ${imgName} successfully deleted from Firebase Storage`);

        return res.status(200).send('File successfully deleted');
    } catch (error) {
        console.error('Error deleting file from Firebase Storage:', error);
        return res.status(500).send('Failed to delete the image');
    }
});

// Start the backend server
const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});

