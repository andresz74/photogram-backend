require('dotenv').config();

const express = require('express');

const { bucket } = require('./config/firebase');
const {
    LOW_MEMORY_MODE,
    MAX_FILE_SIZE_MB,
    MAX_FILE_SIZE,
    MAX_FILE_SIZE_WAS_CLAMPED,
    IMAGE_PROCESSOR,
    RESIZE_CONCURRENCY,
    RESIZE_CONCURRENCY_WAS_CLAMPED,
    FIREBASE_UPLOAD_ACL,
    FIREBASE_URL_MODE,
    FIREBASE_SIGNED_URL_EXPIRES_SECONDS,
} = require('./config/env');
const { createImageController } = require('./controllers/imageController');
const { corsMiddleware } = require('./middleware/cors');
const { multerErrorHandler, fallbackErrorHandler } = require('./middleware/errorHandlers');
const { createMultipartSizeGuard } = require('./middleware/multipartSizeGuard');
const { defaultLimiter, heavyLimiter } = require('./middleware/rateLimiters');
const { createUploadMiddleware } = require('./middleware/upload');
const { createImageRouter } = require('./routes/imageRoutes');
const { createSystemRouter } = require('./routes/systemRoutes');
const { log } = require('./utils/logger');
const { createSemaphore } = require('./utils/semaphore');

const createApp = () => {
    const app = express();

    log('info', 'Configured runtime limits', {
        lowMemoryMode: LOW_MEMORY_MODE,
        maxFileSizeBytes: MAX_FILE_SIZE,
        maxFileSizeMb: MAX_FILE_SIZE_MB,
        resizeConcurrency: RESIZE_CONCURRENCY,
    });
    if (MAX_FILE_SIZE_WAS_CLAMPED) {
        log('warn', 'MAX_FILE_SIZE_MB exceeded safe cap and was clamped', {
            requested: Number(process.env.MAX_FILE_SIZE_MB),
            applied: MAX_FILE_SIZE_MB,
            lowMemoryMode: LOW_MEMORY_MODE,
        });
    }
    if (RESIZE_CONCURRENCY_WAS_CLAMPED) {
        log('warn', 'RESIZE_CONCURRENCY exceeded safe cap and was clamped', {
            requested: Number(process.env.RESIZE_CONCURRENCY),
            applied: RESIZE_CONCURRENCY,
            lowMemoryMode: LOW_MEMORY_MODE,
        });
    }

    const uploadAclLower = FIREBASE_UPLOAD_ACL.toLowerCase();
    const usePredefinedAcl = uploadAclLower !== 'none' && uploadAclLower !== 'disabled';

    const upload = createUploadMiddleware(MAX_FILE_SIZE);
    const multipartSizeGuard = createMultipartSizeGuard(MAX_FILE_SIZE);
    const resizeSemaphore = createSemaphore(RESIZE_CONCURRENCY);

    const imageController = createImageController({
        bucket,
        imageProcessor: IMAGE_PROCESSOR,
        uploadAcl: FIREBASE_UPLOAD_ACL,
        usePredefinedAcl,
        urlMode: FIREBASE_URL_MODE,
        signedUrlExpiresSeconds: FIREBASE_SIGNED_URL_EXPIRES_SECONDS,
    });

    app.use(corsMiddleware);
    app.use(createSystemRouter({ defaultLimiter }));
    app.use(
        createImageRouter({
            defaultLimiter,
            heavyLimiter,
            multipartSizeGuard,
            upload,
            resizeSemaphore,
            imageController,
        }),
    );

    app.use(multerErrorHandler);
    app.use(fallbackErrorHandler);

    return app;
};

module.exports = { createApp };
