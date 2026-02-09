const fs = require('fs');
const multer = require('multer');
const os = require('os');
const path = require('path');
const { v4: uuid } = require('uuid');

const { log } = require('../utils/logger');

const startTempDirCleanup = ({ uploadTempDir, cleanupIntervalMs, staleFileAgeMs }) => {
    const cleanup = async () => {
        try {
            const entries = await fs.promises.readdir(uploadTempDir, { withFileTypes: true });
            const now = Date.now();

            await Promise.all(entries
                .filter((entry) => entry.isFile())
                .map(async (entry) => {
                    const filePath = path.join(uploadTempDir, entry.name);
                    try {
                        const stats = await fs.promises.stat(filePath);
                        if ((now - stats.mtimeMs) >= staleFileAgeMs) {
                            await fs.promises.unlink(filePath);
                        }
                    } catch (error) {
                        log('warn', 'Failed to process temp upload file during cleanup', {
                            filePath,
                            error: error.message,
                        });
                    }
                }));
        } catch (error) {
            log('warn', 'Temp upload cleanup failed', { uploadTempDir, error: error.message });
        }
    };

    const timer = setInterval(cleanup, cleanupIntervalMs);
    timer.unref();
};

const createUploadMiddleware = (maxFileSize, options = {}) => {
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

    const cleanupEnabled = options.cleanupEnabled ?? true;
    if (cleanupEnabled) {
        startTempDirCleanup({
            uploadTempDir,
            cleanupIntervalMs: options.cleanupIntervalMs || (5 * 60 * 1000),
            staleFileAgeMs: options.staleFileAgeMs || (15 * 60 * 1000),
        });
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
