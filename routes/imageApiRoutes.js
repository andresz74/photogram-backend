const express = require('express');

const { createImageApiController } = require('../controllers/imageApiController');
const { withSemaphore } = require('../utils/semaphore');

const passThrough = (req, res, next) => next();

function createImageApiRoutes({
    imageService,
    imageUploadService,
    authProvider,
    heavyLimiter,
    multipartSizeGuard,
    upload,
    resizeSemaphore,
} = {}) {
    const controller = createImageApiController({
        imageService,
        imageUploadService,
        authProvider,
    });
    const router = express.Router();
    const uploadSingleImage = upload && typeof upload.single === 'function'
        ? upload.single('image')
        : passThrough;
    const uploadHandler = resizeSemaphore
        ? withSemaphore(resizeSemaphore, controller.uploadImage)
        : controller.uploadImage;

    router.post(
        '/',
        heavyLimiter || passThrough,
        multipartSizeGuard || passThrough,
        uploadSingleImage,
        uploadHandler,
    );
    router.get('/public', controller.listPublicImages);
    router.get('/me', controller.listMyImages);
    router.patch('/:imageId/visibility', express.json({ limit: '2kb' }), controller.updateImageVisibility);
    router.post('/:imageId/archive', controller.archiveImage);
    router.post('/:imageId/unarchive', controller.unarchiveImage);
    router.delete('/:imageId', controller.deleteImage);

    return router;
}

module.exports = {
    createImageApiRoutes,
};
