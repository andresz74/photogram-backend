const express = require('express');

const { withSemaphore } = require('../utils/semaphore');

const createImageRouter = ({
    defaultLimiter,
    heavyLimiter,
    multipartSizeGuard,
    upload,
    resizeSemaphore,
    imageController,
}) => {
    const router = express.Router();

    router.post(
        '/resize',
        heavyLimiter,
        multipartSizeGuard,
        upload.single('image'),
        withSemaphore(resizeSemaphore, imageController.resize),
    );

    router.post(
        '/upload',
        defaultLimiter,
        multipartSizeGuard,
        upload.single('image'),
        imageController.upload,
    );

    router.post(
        '/resize-upload',
        heavyLimiter,
        multipartSizeGuard,
        upload.single('image'),
        withSemaphore(resizeSemaphore, imageController.resizeUpload),
    );

    router.post(
        '/delete-image',
        defaultLimiter,
        express.json({ limit: '2kb' }),
        express.urlencoded({ extended: true, limit: '2kb' }),
        imageController.deleteImage,
    );

    return router;
};

module.exports = { createImageRouter };
