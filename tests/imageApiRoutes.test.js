const test = require('node:test');
const assert = require('node:assert/strict');

const { createImageApiRoutes } = require('../routes/imageApiRoutes');

const createDependencies = () => ({
    imageService: {
        listPublicImages: async () => [],
        listUserImages: async () => [],
        updateImageVisibility: async (imageId, currentUser, isPublic) => ({ id: imageId, isPublic }),
        archiveImage: async (imageId) => ({ id: imageId, isArchived: true }),
        unarchiveImage: async (imageId) => ({ id: imageId, isArchived: false }),
        deleteImage: async (imageId) => ({ imageId, deleted: true }),
    },
    imageUploadService: {
        uploadImage: async () => ({ id: 'image-1' }),
    },
    authProvider: {
        requireUser: async () => ({ uid: 'user-1' }),
    },
});

const getRouteDescriptors = (router) =>
    router.stack
        .filter((layer) => layer.route)
        .map((layer) => ({
            path: layer.route.path,
            methods: Object.keys(layer.route.methods).filter((method) => layer.route.methods[method]),
        }));

const hasRoute = (router, method, path) =>
    getRouteDescriptors(router).some((route) =>
        route.path === path && route.methods.includes(method.toLowerCase()));

test('creates an Express router', () => {
    const router = createImageApiRoutes(createDependencies());

    assert.equal(typeof router, 'function');
    assert.equal(Array.isArray(router.stack), true);
});

test('rejects missing dependencies through controller factory validation', () => {
    assert.throws(
        () => createImageApiRoutes({}),
        /imageService/,
    );
});

test('registers GET /public', () => {
    const router = createImageApiRoutes(createDependencies());

    assert.equal(hasRoute(router, 'GET', '/public'), true);
});

test('registers GET /me', () => {
    const router = createImageApiRoutes(createDependencies());

    assert.equal(hasRoute(router, 'GET', '/me'), true);
});

test('registers DELETE /:imageId', () => {
    const router = createImageApiRoutes(createDependencies());

    assert.equal(hasRoute(router, 'DELETE', '/:imageId'), true);
});

test('registers POST /', () => {
    const router = createImageApiRoutes(createDependencies());

    assert.equal(hasRoute(router, 'POST', '/'), true);
});

test('registers PATCH /:imageId/visibility', () => {
    const router = createImageApiRoutes(createDependencies());

    assert.equal(hasRoute(router, 'PATCH', '/:imageId/visibility'), true);
});

test('registers POST /:imageId/archive', () => {
    const router = createImageApiRoutes(createDependencies());

    assert.equal(hasRoute(router, 'POST', '/:imageId/archive'), true);
});

test('registers POST /:imageId/unarchive', () => {
    const router = createImageApiRoutes(createDependencies());

    assert.equal(hasRoute(router, 'POST', '/:imageId/unarchive'), true);
});

test('POST / is wired with upload middleware when provided', () => {
    const uploadMiddleware = (req, res, next) => next();
    Object.defineProperty(uploadMiddleware, 'name', { value: 'fakeUploadSingleImage' });
    const dependencies = {
        ...createDependencies(),
        upload: {
            single(fieldName) {
                assert.equal(fieldName, 'image');
                return uploadMiddleware;
            },
        },
    };

    const router = createImageApiRoutes(dependencies);
    const postLayer = router.stack.find((layer) => layer.route && layer.route.path === '/');
    const handlerNames = postLayer.route.stack.map((layer) => layer.handle.name);

    assert.equal(handlerNames.includes('fakeUploadSingleImage'), true);
});

test('POST / maps to controller upload handler', () => {
    const router = createImageApiRoutes(createDependencies());
    const postLayer = router.stack.find((layer) => layer.route && layer.route.path === '/');
    const handlerNames = postLayer.route.stack.map((layer) => layer.handle.name);

    assert.equal(handlerNames.includes('uploadImage'), true);
});

test('does not register legacy /resize-upload', () => {
    const router = createImageApiRoutes(createDependencies());
    const paths = getRouteDescriptors(router).map((route) => route.path);

    assert.equal(paths.includes('/resize-upload'), false);
});

test('does not register legacy /delete-image', () => {
    const router = createImageApiRoutes(createDependencies());
    const paths = getRouteDescriptors(router).map((route) => route.path);

    assert.equal(paths.includes('/delete-image'), false);
});
