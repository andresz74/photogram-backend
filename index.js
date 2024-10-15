const cors = require('cors');
const express = require('express');
const multer = require('multer');
const Jimp = require('jimp');
const admin = require('firebase-admin');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'photograma-c2078.appspot.com',
});

// Enable CORS
app.use(cors({
    origin: 'http://192.168.1.181:3000', // Allow requests from your frontend
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

const bucket = admin.storage().bucket();

// Backend route to handle image upload
app.post('/upload', upload.single('image'), async (req, res) => {
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

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server is running on http://127.0.0.1:${PORT}`);
});

// Backend route to handle image deletion
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
const PORT = process.env.PORT || 3003; // Default to 3003 if not provided
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

