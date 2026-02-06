const fs = require('fs');
const multer = require('multer');
const os = require('os');
const path = require('path');
const { v4: uuid } = require('uuid');

const { log } = require('../utils/logger');

const createUploadMiddleware = (maxFileSize) => {
    const uploadTempDir = path.join(os.tmpdir(), 'photogram-backend-uploads');

    try {
        fs.mkdirSync(uploadTempDir, { recursive: true });
    } catch (error) {
        log('error', 'Failed to create temp upload directory', {
            uploadTempDir,
            error: error.message,
        });
        process.exit(1);
    }

    const imageFileFilter = (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }
        return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
    };

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadTempDir),
        filename: (req, file, cb) => cb(null, `${uuid()}-${Date.now()}`),
    });

    return multer({
        storage,
        limits: { fileSize: maxFileSize },
        fileFilter: imageFileFilter,
    });
};

module.exports = { createUploadMiddleware };
