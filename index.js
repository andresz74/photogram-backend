const cors = require('cors');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const admin = require('firebase-admin');
const serviceAccount = require('./path-to-your-service-account.json');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'your-firebase-storage-bucket' // Your Firebase Storage bucket
});

// Enable CORS
app.use(cors({
    origin: 'http://localhost:3000', // Allow requests from your frontend running on port 3001
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true // Allow credentials if needed (cookies, authorization headers, etc.)
}));

const bucket = admin.storage().bucket();

// Backend route to handle image upload
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        const fileBuffer = req.file.buffer;
        const compressedBuffer = await sharp(fileBuffer)
            .resize(1440)  // Resize to the dimensions you need
            .toFormat('jpeg', { quality: 80 })  // Compress image to JPEG
            .toBuffer();

        const fileName = `images/${Date.now()}-${req.file.originalname}`;
        const file = bucket.file(fileName);

        // Upload the compressed image to Firebase Storage
        const uploadResponse = await file.save(compressedBuffer, {
            metadata: { contentType: 'image/jpeg' },
            public: true,  // If you want the image to be publicly accessible
        });

        // Get the public URL of the uploaded file
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        res.json({ url: publicUrl });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Backend route to handle image deletion
app.post('/api/delete-image', async (req, res) => {
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
app.listen(3003, () => {
    console.log('Server is running on port 3003');
});
