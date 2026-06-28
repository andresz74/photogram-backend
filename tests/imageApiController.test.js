const test = require('node:test');
const assert = require('node:assert/strict');

const { createImageApiController } = require('../controllers/imageApiController');

const createResponse = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    },
});

const createNext = () => {
    const calls = [];
    const next = (error) => calls.push(error);
    next.calls = calls;
    return next;
};

const createDependencies = (overrides = {}) => {
    const serviceCalls = [];
    const authCalls = [];
    const currentUser = overrides.currentUser || { uid: 'user-1', email: 'user@example.com' };
    const images = overrides.images || [{ id: 'image-1', imageUrl: 'http://localhost/media/image-1.webp' }];
    const uploadedImage = overrides.uploadedImage || { id: 'image-2', imageUrl: 'http://localhost/media/image-2.webp' };
    const deleteResult = overrides.deleteResult || { imageId: 'image-1', deleted: true };
    const updatedImage = overrides.updatedImage === undefined
        ? { id: 'image-1', imageUrl: 'http://localhost/media/image-1.webp' }
        : overrides.updatedImage;

    const imageService = {
        calls: serviceCalls,
        async listPublicImages(options) {
            serviceCalls.push({ method: 'listPublicImages', options });
            if (overrides.listPublicImagesError) {
                throw overrides.listPublicImagesError;
            }
            return images;
        },
        async listUserImages(user, options) {
            serviceCalls.push({ method: 'listUserImages', user, options });
            if (overrides.listUserImagesError) {
                throw overrides.listUserImagesError;
            }
            return images;
        },
        async updateImageVisibility(imageId, user, isPublic) {
            serviceCalls.push({ method: 'updateImageVisibility', imageId, user, isPublic });
            if (overrides.updateImageVisibilityError) {
                throw overrides.updateImageVisibilityError;
            }
            return updatedImage;
        },
        async archiveImage(imageId, user) {
            serviceCalls.push({ method: 'archiveImage', imageId, user });
            if (overrides.archiveImageError) {
                throw overrides.archiveImageError;
            }
            return updatedImage;
        },
        async unarchiveImage(imageId, user) {
            serviceCalls.push({ method: 'unarchiveImage', imageId, user });
            if (overrides.unarchiveImageError) {
                throw overrides.unarchiveImageError;
            }
            return updatedImage;
        },
        async deleteImage(imageId, user) {
            serviceCalls.push({ method: 'deleteImage', imageId, user });
            if (overrides.deleteImageError) {
                throw overrides.deleteImageError;
            }
            return deleteResult;
        },
    };

    const uploadCalls = [];
    const imageUploadService = {
        calls: uploadCalls,
        async uploadImage(input) {
            uploadCalls.push(input);
            if (overrides.uploadImageError) {
                throw overrides.uploadImageError;
            }
            return uploadedImage;
        },
    };

    const authProvider = {
        calls: authCalls,
        async requireUser(req) {
            authCalls.push(req);
            if (overrides.requireUserError) {
                throw overrides.requireUserError;
            }
            return currentUser;
        },
    };

    return {
        imageService,
        imageUploadService,
        authProvider,
        currentUser,
        uploadedImage,
    };
};

const createControllerContext = (overrides = {}) => {
    const dependencies = createDependencies(overrides);
    return {
        ...dependencies,
        controller: createImageApiController(dependencies),
    };
};

const assertValidationError = (error, inputName) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.match(error.message, new RegExp(inputName));
};

test('creates an image API controller', () => {
    const { controller } = createControllerContext();

    assert.equal(typeof controller.listPublicImages, 'function');
    assert.equal(typeof controller.listMyImages, 'function');
    assert.equal(typeof controller.updateImageVisibility, 'function');
    assert.equal(typeof controller.archiveImage, 'function');
    assert.equal(typeof controller.unarchiveImage, 'function');
    assert.equal(typeof controller.deleteImage, 'function');
    assert.equal(typeof controller.uploadImage, 'function');
});

test('rejects missing imageService', () => {
    const { authProvider } = createDependencies();

    assert.throws(
        () => createImageApiController({ authProvider }),
        /imageService/,
    );
});

test('rejects missing authProvider', () => {
    const { imageService, imageUploadService } = createDependencies();

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService }),
        /authProvider/,
    );
});

test('rejects missing imageUploadService', () => {
    const { imageService, authProvider } = createDependencies();

    assert.throws(
        () => createImageApiController({ imageService, authProvider }),
        /imageUploadService/,
    );
});

test('rejects missing imageService.listPublicImages', () => {
    const { imageService, imageUploadService, authProvider } = createDependencies();
    imageService.listPublicImages = undefined;

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService, authProvider }),
        /imageService\.listPublicImages/,
    );
});

test('rejects missing imageService.listUserImages', () => {
    const { imageService, imageUploadService, authProvider } = createDependencies();
    imageService.listUserImages = undefined;

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService, authProvider }),
        /imageService\.listUserImages/,
    );
});

test('rejects missing imageService.deleteImage', () => {
    const { imageService, imageUploadService, authProvider } = createDependencies();
    imageService.deleteImage = undefined;

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService, authProvider }),
        /imageService\.deleteImage/,
    );
});

test('rejects missing imageService.updateImageVisibility', () => {
    const { imageService, imageUploadService, authProvider } = createDependencies();
    imageService.updateImageVisibility = undefined;

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService, authProvider }),
        /imageService\.updateImageVisibility/,
    );
});

test('rejects missing imageService.archiveImage', () => {
    const { imageService, imageUploadService, authProvider } = createDependencies();
    imageService.archiveImage = undefined;

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService, authProvider }),
        /imageService\.archiveImage/,
    );
});

test('rejects missing imageService.unarchiveImage', () => {
    const { imageService, imageUploadService, authProvider } = createDependencies();
    imageService.unarchiveImage = undefined;

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService, authProvider }),
        /imageService\.unarchiveImage/,
    );
});

test('rejects missing authProvider.requireUser', () => {
    const { imageService, imageUploadService, authProvider } = createDependencies();
    authProvider.requireUser = undefined;

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService, authProvider }),
        /authProvider\.requireUser/,
    );
});

test('controller requires imageUploadService.uploadImage', () => {
    const { imageService, imageUploadService, authProvider } = createDependencies();
    imageUploadService.uploadImage = undefined;

    assert.throws(
        () => createImageApiController({ imageService, imageUploadService, authProvider }),
        /imageUploadService\.uploadImage/,
    );
});

test('listPublicImages calls imageService.listPublicImages', async () => {
    const { controller, imageService } = createControllerContext();

    await controller.listPublicImages({ query: {} }, createResponse(), createNext());

    assert.equal(imageService.calls[0].method, 'listPublicImages');
});

test('listPublicImages responds with status 200', async () => {
    const { controller } = createControllerContext();
    const res = createResponse();

    await controller.listPublicImages({ query: {} }, res, createNext());

    assert.equal(res.statusCode, 200);
});

test('listPublicImages responds with { images }', async () => {
    const images = [{ id: 'image-1' }];
    const { controller } = createControllerContext({ images });
    const res = createResponse();

    await controller.listPublicImages({ query: {} }, res, createNext());

    assert.deepEqual(res.body, { images });
});

test('listPublicImages passes parsed limit', async () => {
    const { controller, imageService } = createControllerContext();

    await controller.listPublicImages({ query: { limit: '50' } }, createResponse(), createNext());

    assert.equal(imageService.calls[0].options.limit, 50);
});

test('listPublicImages passes parsed offset', async () => {
    const { controller, imageService } = createControllerContext();

    await controller.listPublicImages({ query: { offset: '0' } }, createResponse(), createNext());

    assert.equal(imageService.calls[0].options.offset, 0);
});

test('listPublicImages omits pagination options when query is empty', async () => {
    const { controller, imageService } = createControllerContext();

    await controller.listPublicImages({ query: {} }, createResponse(), createNext());

    assert.deepEqual(imageService.calls[0].options, {});
});

test('listPublicImages calls next(error) when service throws', async () => {
    const serviceError = new Error('service failed');
    const { controller } = createControllerContext({ listPublicImagesError: serviceError });
    const next = createNext();

    await controller.listPublicImages({ query: {} }, createResponse(), next);

    assert.equal(next.calls[0], serviceError);
});

test('listMyImages calls authProvider.requireUser(req)', async () => {
    const { controller, authProvider } = createControllerContext();
    const req = { query: {} };

    await controller.listMyImages(req, createResponse(), createNext());

    assert.equal(authProvider.calls[0], req);
});

test('listMyImages calls imageService.listUserImages(currentUser, options)', async () => {
    const { controller, imageService, currentUser } = createControllerContext();

    await controller.listMyImages({ query: { limit: '10' } }, createResponse(), createNext());

    assert.equal(imageService.calls[0].method, 'listUserImages');
    assert.equal(imageService.calls[0].user, currentUser);
    assert.deepEqual(imageService.calls[0].options, { limit: 10 });
});

test('listMyImages parses archived query option', async () => {
    const { controller, imageService } = createControllerContext();

    await controller.listMyImages({ query: { archived: 'true' } }, createResponse(), createNext());

    assert.deepEqual(imageService.calls[0].options, { archived: true });
});

test('listMyImages parses includeArchived query option', async () => {
    const { controller, imageService } = createControllerContext();

    await controller.listMyImages({ query: { includeArchived: 'true' } }, createResponse(), createNext());

    assert.deepEqual(imageService.calls[0].options, { includeArchived: true });
});

test('listMyImages rejects invalid archived query option', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.listMyImages({ query: { archived: 'yes' } }, createResponse(), next);

    assertValidationError(next.calls[0], 'archived');
});

test('listMyImages rejects invalid includeArchived query option', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.listMyImages({ query: { includeArchived: [] } }, createResponse(), next);

    assertValidationError(next.calls[0], 'includeArchived');
});

test('listMyImages responds with status 200', async () => {
    const { controller } = createControllerContext();
    const res = createResponse();

    await controller.listMyImages({ query: {} }, res, createNext());

    assert.equal(res.statusCode, 200);
});

test('listMyImages responds with { images }', async () => {
    const images = [{ id: 'image-1' }];
    const { controller } = createControllerContext({ images });
    const res = createResponse();

    await controller.listMyImages({ query: {} }, res, createNext());

    assert.deepEqual(res.body, { images });
});

test('listMyImages calls next(error) when auth throws', async () => {
    const authError = new Error('auth failed');
    const { controller } = createControllerContext({ requireUserError: authError });
    const next = createNext();

    await controller.listMyImages({ query: {} }, createResponse(), next);

    assert.equal(next.calls[0], authError);
});

test('listMyImages calls next(error) when service throws', async () => {
    const serviceError = new Error('service failed');
    const { controller } = createControllerContext({ listUserImagesError: serviceError });
    const next = createNext();

    await controller.listMyImages({ query: {} }, createResponse(), next);

    assert.equal(next.calls[0], serviceError);
});

test('updateImageVisibility authenticates with authProvider.requireUser(req)', async () => {
    const { controller, authProvider } = createControllerContext();
    const req = { params: { imageId: 'image-1' }, body: { isPublic: false } };

    await controller.updateImageVisibility(req, createResponse(), createNext());

    assert.equal(authProvider.calls[0], req);
});

test('updateImageVisibility calls imageService.updateImageVisibility', async () => {
    const { controller, imageService, currentUser } = createControllerContext();

    await controller.updateImageVisibility({
        params: { imageId: 'image-1' },
        body: { isPublic: false },
    }, createResponse(), createNext());

    assert.deepEqual(imageService.calls[0], {
        method: 'updateImageVisibility',
        imageId: 'image-1',
        user: currentUser,
        isPublic: false,
    });
});

test('updateImageVisibility responds with status 200 and { image }', async () => {
    const updatedImage = { id: 'image-1', isPublic: false };
    const { controller } = createControllerContext({ updatedImage });
    const res = createResponse();

    await controller.updateImageVisibility({
        params: { imageId: 'image-1' },
        body: { isPublic: false },
    }, res, createNext());

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { image: updatedImage });
});

test('updateImageVisibility validates boolean isPublic', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.updateImageVisibility({
        params: { imageId: 'image-1' },
        body: { isPublic: 'false' },
    }, createResponse(), next);

    assertValidationError(next.calls[0], 'isPublic');
});

test('updateImageVisibility returns 404 when service returns null', async () => {
    const { controller } = createControllerContext({ updatedImage: null });
    const res = createResponse();

    await controller.updateImageVisibility({
        params: { imageId: 'missing' },
        body: { isPublic: false },
    }, res, createNext());

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Image not found' });
});

test('archiveImage authenticates and returns { image }', async () => {
    const updatedImage = { id: 'image-1', isArchived: true };
    const { controller, imageService, currentUser } = createControllerContext({ updatedImage });
    const req = { params: { imageId: 'image-1' } };
    const res = createResponse();

    await controller.archiveImage(req, res, createNext());

    assert.equal(imageService.calls[0].method, 'archiveImage');
    assert.equal(imageService.calls[0].user, currentUser);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { image: updatedImage });
});

test('unarchiveImage authenticates and returns { image }', async () => {
    const updatedImage = { id: 'image-1', isArchived: false };
    const { controller, imageService, currentUser } = createControllerContext({ updatedImage });
    const req = { params: { imageId: 'image-1' } };
    const res = createResponse();

    await controller.unarchiveImage(req, res, createNext());

    assert.equal(imageService.calls[0].method, 'unarchiveImage');
    assert.equal(imageService.calls[0].user, currentUser);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { image: updatedImage });
});

test('archiveImage rejects missing imageId', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.archiveImage({ params: {} }, createResponse(), next);

    assertValidationError(next.calls[0], 'imageId');
});

test('unarchiveImage calls next(error) when service throws', async () => {
    const serviceError = new Error('service failed');
    const { controller } = createControllerContext({ unarchiveImageError: serviceError });
    const next = createNext();

    await controller.unarchiveImage({ params: { imageId: 'image-1' } }, createResponse(), next);

    assert.equal(next.calls[0], serviceError);
});

test('deleteImage reads imageId from req.params.imageId', async () => {
    const { controller, imageService } = createControllerContext();

    await controller.deleteImage({ params: { imageId: 'image-123' } }, createResponse(), createNext());

    assert.equal(imageService.calls[0].imageId, 'image-123');
});

test('deleteImage calls authProvider.requireUser(req)', async () => {
    const { controller, authProvider } = createControllerContext();
    const req = { params: { imageId: 'image-1' } };

    await controller.deleteImage(req, createResponse(), createNext());

    assert.equal(authProvider.calls[0], req);
});

test('deleteImage calls imageService.deleteImage(imageId, currentUser)', async () => {
    const { controller, imageService, currentUser } = createControllerContext();

    await controller.deleteImage({ params: { imageId: 'image-1' } }, createResponse(), createNext());

    assert.equal(imageService.calls[0].method, 'deleteImage');
    assert.equal(imageService.calls[0].imageId, 'image-1');
    assert.equal(imageService.calls[0].user, currentUser);
});

test('deleteImage responds with status 200', async () => {
    const { controller } = createControllerContext();
    const res = createResponse();

    await controller.deleteImage({ params: { imageId: 'image-1' } }, res, createNext());

    assert.equal(res.statusCode, 200);
});

test('deleteImage responds with the delete result', async () => {
    const deleteResult = { imageId: 'image-1', deleted: true };
    const { controller } = createControllerContext({ deleteResult });
    const res = createResponse();

    await controller.deleteImage({ params: { imageId: 'image-1' } }, res, createNext());

    assert.deepEqual(res.body, deleteResult);
});

test('deleteImage rejects missing imageId', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.deleteImage({ params: {} }, createResponse(), next);

    assertValidationError(next.calls[0], 'imageId');
});

test('deleteImage rejects empty imageId', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.deleteImage({ params: { imageId: '' } }, createResponse(), next);

    assertValidationError(next.calls[0], 'imageId');
});

test('deleteImage calls next(error) when auth throws', async () => {
    const authError = new Error('auth failed');
    const { controller } = createControllerContext({ requireUserError: authError });
    const next = createNext();

    await controller.deleteImage({ params: { imageId: 'image-1' } }, createResponse(), next);

    assert.equal(next.calls[0], authError);
});

test('deleteImage calls next(error) when service throws', async () => {
    const serviceError = new Error('service failed');
    const { controller } = createControllerContext({ deleteImageError: serviceError });
    const next = createNext();

    await controller.deleteImage({ params: { imageId: 'image-1' } }, createResponse(), next);

    assert.equal(next.calls[0], serviceError);
});

test('uploadImage authenticates with authProvider.requireUser(req)', async () => {
    const { controller, authProvider } = createControllerContext();
    const req = { file: { path: '/tmp/file' }, body: {} };

    await controller.uploadImage(req, createResponse(), createNext());

    assert.equal(authProvider.calls[0], req);
});

test('uploadImage passes req.file, currentUser, and req.body to upload service', async () => {
    const { controller, imageUploadService, currentUser } = createControllerContext();
    const file = { path: '/tmp/file' };
    const body = { title: 'Upload' };

    await controller.uploadImage({ file, body }, createResponse(), createNext());

    assert.deepEqual(imageUploadService.calls[0], {
        file,
        currentUser,
        fields: body,
    });
});

test('uploadImage responds with status 201', async () => {
    const { controller } = createControllerContext();
    const res = createResponse();

    await controller.uploadImage({ file: {}, body: {} }, res, createNext());

    assert.equal(res.statusCode, 201);
});

test('uploadImage responds with { image }', async () => {
    const uploadedImage = { id: 'image-2', imageUrl: 'http://localhost/media/image-2.webp' };
    const { controller } = createControllerContext({ uploadedImage });
    const res = createResponse();

    await controller.uploadImage({ file: {}, body: {} }, res, createNext());

    assert.deepEqual(res.body, { image: uploadedImage });
});

test('uploadImage calls next(error) when auth fails', async () => {
    const authError = new Error('auth failed');
    const { controller } = createControllerContext({ requireUserError: authError });
    const next = createNext();

    await controller.uploadImage({ file: {}, body: {} }, createResponse(), next);

    assert.equal(next.calls[0], authError);
});

test('uploadImage calls next(error) when upload service fails', async () => {
    const uploadError = new Error('upload failed');
    const { controller } = createControllerContext({ uploadImageError: uploadError });
    const next = createNext();

    await controller.uploadImage({ file: {}, body: {} }, createResponse(), next);

    assert.equal(next.calls[0], uploadError);
});

test('uploadImage does not call upload service when auth fails', async () => {
    const authError = new Error('auth failed');
    const { controller, imageUploadService } = createControllerContext({ requireUserError: authError });

    await controller.uploadImage({ file: {}, body: {} }, createResponse(), createNext());

    assert.equal(imageUploadService.calls.length, 0);
});

test('invalid limit produces validation error with statusCode = 400', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.listPublicImages({ query: { limit: '0' } }, createResponse(), next);

    assert.equal(next.calls[0].statusCode, 400);
});

test('invalid limit produces validation error with code = VALIDATION_ERROR', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.listPublicImages({ query: { limit: '-1' } }, createResponse(), next);

    assert.equal(next.calls[0].code, 'VALIDATION_ERROR');
});

test('invalid offset produces validation error with statusCode = 400', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.listPublicImages({ query: { offset: '-1' } }, createResponse(), next);

    assert.equal(next.calls[0].statusCode, 400);
});

test('invalid offset produces validation error with code = VALIDATION_ERROR', async () => {
    const { controller } = createControllerContext();
    const next = createNext();

    await controller.listPublicImages({ query: { offset: '1.5' } }, createResponse(), next);

    assert.equal(next.calls[0].code, 'VALIDATION_ERROR');
});

test('validation error messages include the relevant input name', async () => {
    const { controller } = createControllerContext();
    const limitNext = createNext();
    const offsetNext = createNext();
    const imageIdNext = createNext();

    await controller.listPublicImages({ query: { limit: 'abc' } }, createResponse(), limitNext);
    await controller.listPublicImages({ query: { offset: 'abc' } }, createResponse(), offsetNext);
    await controller.deleteImage({ params: { imageId: '' } }, createResponse(), imageIdNext);

    assert.match(limitNext.calls[0].message, /limit/);
    assert.match(offsetNext.calls[0].message, /offset/);
    assert.match(imageIdNext.calls[0].message, /imageId/);
});

test('controller rejects invalid pagination cases', async () => {
    const invalidQueries = [
        { limit: '0' },
        { limit: '-1' },
        { limit: '1.5' },
        { limit: 'abc' },
        { limit: '' },
        { limit: [] },
        { offset: '-1' },
        { offset: '1.5' },
        { offset: 'abc' },
        { offset: '' },
        { offset: [] },
    ];

    for (const query of invalidQueries) {
        const { controller } = createControllerContext();
        const next = createNext();

        await controller.listPublicImages({ query }, createResponse(), next);

        assert.equal(next.calls[0].statusCode, 400);
        assert.equal(next.calls[0].code, 'VALIDATION_ERROR');
    }
});

test('controller does not mutate req.query', async () => {
    const { controller } = createControllerContext();
    const query = { limit: '10', offset: '2' };
    const before = JSON.stringify(query);

    await controller.listPublicImages({ query }, createResponse(), createNext());

    assert.equal(JSON.stringify(query), before);
});

test('controller does not mutate authenticated user object', async () => {
    const currentUser = { uid: 'user-1', email: 'user@example.com' };
    const before = JSON.stringify(currentUser);
    const { controller } = createControllerContext({ currentUser });

    await controller.listMyImages({ query: {} }, createResponse(), createNext());

    assert.equal(JSON.stringify(currentUser), before);
});
