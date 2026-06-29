require('dotenv').config();

const express = require('express');

const {
    LOW_MEMORY_MODE,
    MAX_FILE_SIZE_MB,
    MAX_FILE_SIZE,
    MAX_FILE_SIZE_WAS_CLAMPED,
    IMAGE_PROCESSOR,
    RESIZE_CONCURRENCY,
    RESIZE_CONCURRENCY_WAS_CLAMPED,
    DEFAULT_RATE_LIMIT_MAX,
    HEAVY_RATE_LIMIT_MAX,
    HEAVY_RATE_LIMIT_WAS_CLAMPED,
    ENABLE_DEBUG_ENDPOINT,
    UPLOAD_TEMP_CLEANUP_ENABLED,
    UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS,
    UPLOAD_TEMP_STALE_AGE_SECONDS,
    FIREBASE_UPLOAD_ACL,
    FIREBASE_URL_MODE,
    FIREBASE_SIGNED_URL_EXPIRES_SECONDS,
} = require('./config/env');
const { createImageController } = require('./controllers/imageController');
const { corsMiddleware } = require('./middleware/cors');
const { multerErrorHandler, fallbackErrorHandler } = require('./middleware/errorHandlers');
const { createMultipartSizeGuard } = require('./middleware/multipartSizeGuard');
const { createRateLimiters } = require('./middleware/rateLimiters');
const { createStaticMediaMiddleware } = require('./middleware/staticMedia');
const { createUploadMiddleware } = require('./middleware/upload');
const { createImageApiRoutes } = require('./routes/imageApiRoutes');
const { createImageRouter } = require('./routes/imageRoutes');
const { createSystemRouter } = require('./routes/systemRoutes');
const { log } = require('./utils/logger');
const { createSemaphore } = require('./utils/semaphore');

const createApp = ({ container, legacyBucket, legacyBucketGetter } = {}) => {
    const app = express();
    const trustProxy = container && container.config
        ? container.config.trustProxy
        : false;

    if (trustProxy) {
        app.set('trust proxy', trustProxy);
    }

    log('info', 'Configured runtime limits', {
        lowMemoryMode: LOW_MEMORY_MODE,
        maxFileSizeBytes: MAX_FILE_SIZE,
        maxFileSizeMb: MAX_FILE_SIZE_MB,
        resizeConcurrency: RESIZE_CONCURRENCY,
        defaultRateLimitMax: DEFAULT_RATE_LIMIT_MAX,
        heavyRateLimitMax: HEAVY_RATE_LIMIT_MAX,
        debugEndpointEnabled: ENABLE_DEBUG_ENDPOINT,
        uploadTempCleanupEnabled: UPLOAD_TEMP_CLEANUP_ENABLED,
        uploadTempCleanupIntervalSeconds: UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS,
        uploadTempStaleAgeSeconds: UPLOAD_TEMP_STALE_AGE_SECONDS,
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
    if (HEAVY_RATE_LIMIT_WAS_CLAMPED) {
        log('warn', 'HEAVY_RATE_LIMIT_MAX exceeded safe cap and was clamped', {
            requested: Number(process.env.HEAVY_RATE_LIMIT_MAX),
            applied: HEAVY_RATE_LIMIT_MAX,
            lowMemoryMode: LOW_MEMORY_MODE,
        });
    }

    const uploadAclLower = FIREBASE_UPLOAD_ACL.toLowerCase();
    const usePredefinedAcl = uploadAclLower !== 'none' && uploadAclLower !== 'disabled';
    const { defaultLimiter, heavyLimiter } = createRateLimiters({
        defaultMax: DEFAULT_RATE_LIMIT_MAX,
        heavyMax: HEAVY_RATE_LIMIT_MAX,
    });

    const upload = createUploadMiddleware(MAX_FILE_SIZE, {
        cleanupEnabled: UPLOAD_TEMP_CLEANUP_ENABLED,
        cleanupIntervalMs: UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS * 1000,
        staleFileAgeMs: UPLOAD_TEMP_STALE_AGE_SECONDS * 1000,
    });
    const multipartSizeGuard = createMultipartSizeGuard(MAX_FILE_SIZE);
    const resizeSemaphore = createSemaphore(RESIZE_CONCURRENCY);

    const imageController = createImageController({
        bucket: legacyBucket,
        bucketGetter: legacyBucketGetter,
        imageProcessor: IMAGE_PROCESSOR,
        uploadAcl: FIREBASE_UPLOAD_ACL,
        usePredefinedAcl,
        urlMode: FIREBASE_URL_MODE,
        signedUrlExpiresSeconds: FIREBASE_SIGNED_URL_EXPIRES_SECONDS,
    });

    app.use(corsMiddleware);
    app.use(createSystemRouter({ defaultLimiter, enableDebugEndpoint: ENABLE_DEBUG_ENDPOINT }));
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

    if (container) {
        app.use('/images', createImageApiRoutes({
            imageService: container.imageService,
            imageUploadService: container.imageUploadService,
            authProvider: container.authProvider,
            heavyLimiter,
            multipartSizeGuard,
            upload,
            resizeSemaphore,
        }));
    }

    if (
        container
        && container.config
        && container.config.storageProvider === 'local'
        && container.storageProvider
    ) {
        app.use('/media', createStaticMediaMiddleware({
            storageProvider: container.storageProvider,
        }));
    }

    app.use(multerErrorHandler);
    app.use(fallbackErrorHandler);

    return app;
};

module.exports = { createApp };
