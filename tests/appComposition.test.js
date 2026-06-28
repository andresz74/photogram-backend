const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Readable } = require('node:stream');

const originalEnv = process.env;
process.env = {
    ...originalEnv,
    FIREBASE_SERVICE_ACCOUNT_PATH: '/tmp/fake-service-account.json',
};

const appModule = require('../app');
const { createImageRouter } = require('../routes/imageRoutes');

process.env = originalEnv;

const createFakeContainer = (overrides = {}) => {
    const calls = [];
    const fakeStorageProvider = overrides.storageProvider || {
        objectExists: async (storageKey) => {
            calls.push({ method: 'objectExists', storageKey });
            return storageKey === 'users/user-1/images/image-1.webp';
        },
        createReadStream: (storageKey) => {
            calls.push({ method: 'createReadStream', storageKey });
            return Readable.from([`content:${storageKey}`]);
        },
        getUrl: (storageKey) => `http://localhost:3000/media/${storageKey}`,
        deleteObject: async (storageKey) => ({ storageKey, deleted: true }),
    };
    const fakeAuthProvider = {
        getCurrentUser: async () => null,
        requireUser: async (req) => {
            calls.push({ method: 'requireUser', req });
            if (overrides.authError) {
                throw overrides.authError;
            }
            return { uid: 'user-1' };
        },
    };
    const fakeImageService = {
        listPublicImages: async (options) => {
            calls.push({ method: 'listPublicImages', options });
            if (overrides.listPublicImagesError) {
                throw overrides.listPublicImagesError;
            }
            return [
                {
                    id: 'public-image-1',
                    imageUrl: 'http://localhost/media/public-image-1.webp',
                    isPublic: true,
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            ];
        },
        listUserImages: async (currentUser, options) => {
            calls.push({ method: 'listUserImages', currentUser, options });
            return [
                {
                    id: 'user-image-1',
                    imageUrl: 'http://localhost/media/user-image-1.webp',
                    isPublic: false,
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            ];
        },
        deleteImage: async (imageId, currentUser) => {
            calls.push({ method: 'deleteImage', imageId, currentUser });
            return {
                imageId,
                deleted: true,
            };
        },
        updateImageVisibility: async (imageId, currentUser, isPublic) => {
            calls.push({ method: 'updateImageVisibility', imageId, currentUser, isPublic });
            return {
                id: imageId,
                imageUrl: `http://localhost/media/${imageId}.webp`,
                isPublic,
                isArchived: false,
                createdAt: '2026-01-01T00:00:00.000Z',
            };
        },
        archiveImage: async (imageId, currentUser) => {
            calls.push({ method: 'archiveImage', imageId, currentUser });
            return {
                id: imageId,
                imageUrl: `http://localhost/media/${imageId}.webp`,
                isPublic: false,
                isArchived: true,
                archivedAt: '2026-01-02T00:00:00.000Z',
                createdAt: '2026-01-01T00:00:00.000Z',
            };
        },
        unarchiveImage: async (imageId, currentUser) => {
            calls.push({ method: 'unarchiveImage', imageId, currentUser });
            return {
                id: imageId,
                imageUrl: `http://localhost/media/${imageId}.webp`,
                isPublic: false,
                isArchived: false,
                createdAt: '2026-01-01T00:00:00.000Z',
            };
        },
    };
    const fakeImageUploadService = {
        uploadImage: async ({ file, currentUser, fields }) => {
            calls.push({ method: 'uploadImage', file, currentUser, fields });
            return {
                id: 'uploaded-image-1',
                imageUrl: 'http://localhost/media/uploaded-image-1.webp',
                isPublic: true,
                createdAt: '2026-01-01T00:00:00.000Z',
            };
        },
    };

    return {
        calls,
        config: {
            storageProvider: overrides.storageProviderName || 'firebase',
        },
        storageProvider: fakeStorageProvider,
        authProvider: fakeAuthProvider,
        imageService: fakeImageService,
        imageUploadService: fakeImageUploadService,
    };
};

const getCreateApp = () => appModule.createApp || appModule;

const parseHeaderList = (value) => String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const request = async (app, options) => {
    const server = http.createServer(app);

    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    try {
        return await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: options.path,
                method: options.method || 'GET',
                headers: options.headers || {},
            }, (res) => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body,
                        json: body && res.headers['content-type'] && res.headers['content-type'].includes('application/json')
                            ? JSON.parse(body)
                            : null,
                    });
                });
            });

            req.on('error', reject);
            req.end(options.body || undefined);
        });
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

test('app module still exports a usable app factory according to existing project expectations', () => {
    assert.equal(typeof appModule.createApp, 'function');
});

test('createApp({ container }) creates an Express app', () => {
    const createApp = getCreateApp();
    const app = createApp({ container: createFakeContainer() });

    assert.equal(typeof app, 'function');
    assert.equal(typeof app.use, 'function');
});

test('mounted app responds to GET /images/public', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/public' });

    assert.notEqual(response.statusCode, 404);
});

test('GET /images/public returns status 200', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/public' });

    assert.equal(response.statusCode, 200);
});

test('GET /images/public returns { images }', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/public' });

    assert.deepEqual(response.json, {
        images: [
            {
                id: 'public-image-1',
                imageUrl: 'http://localhost/media/public-image-1.webp',
                isPublic: true,
                createdAt: '2026-01-01T00:00:00.000Z',
            },
        ],
    });
});

test('mounted app responds to GET /images/me', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/me' });

    assert.notEqual(response.statusCode, 404);
});

test('GET /images/me returns status 200 when fake auth succeeds', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/me' });

    assert.equal(response.statusCode, 200);
});

test('GET /images/me returns { images }', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/me' });

    assert.deepEqual(response.json, {
        images: [
            {
                id: 'user-image-1',
                imageUrl: 'http://localhost/media/user-image-1.webp',
                isPublic: false,
                createdAt: '2026-01-01T00:00:00.000Z',
            },
        ],
    });
});

test('mounted app responds to DELETE /images/:imageId', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/image-1', method: 'DELETE' });

    assert.notEqual(response.statusCode, 404);
});

test('DELETE /images/:imageId returns status 200', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/image-1', method: 'DELETE' });

    assert.equal(response.statusCode, 200);
});

test('DELETE /images/:imageId returns delete result', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images/image-1', method: 'DELETE' });

    assert.deepEqual(response.json, {
        imageId: 'image-1',
        deleted: true,
    });
});

test('mounted app responds to PATCH /images/:imageId/visibility', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, {
        path: '/images/image-1/visibility',
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isPublic: false }),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {
        image: {
            id: 'image-1',
            imageUrl: 'http://localhost/media/image-1.webp',
            isPublic: false,
            isArchived: false,
            createdAt: '2026-01-01T00:00:00.000Z',
        },
    });
});

test('mounted app responds to POST /images/:imageId/archive', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, {
        path: '/images/image-1/archive',
        method: 'POST',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json.image.isArchived, true);
});

test('mounted app responds to POST /images/:imageId/unarchive', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, {
        path: '/images/image-1/unarchive',
        method: 'POST',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json.image.isArchived, false);
});

test('OPTIONS /images/:imageId DELETE preflight returns successful status', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, {
        path: '/images/test-image-id',
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'DELETE',
            'Access-Control-Request-Headers': 'authorization',
        },
    });

    assert.equal(response.statusCode, 204);
});

test('OPTIONS /images/:imageId DELETE preflight allows localhost frontend origin', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, {
        path: '/images/test-image-id',
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'DELETE',
            'Access-Control-Request-Headers': 'authorization',
        },
    });

    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:3000');
});

test('OPTIONS /images/:imageId DELETE preflight allows DELETE method', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, {
        path: '/images/test-image-id',
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'DELETE',
            'Access-Control-Request-Headers': 'authorization',
        },
    });

    assert.equal(parseHeaderList(response.headers['access-control-allow-methods']).includes('delete'), true);
});

test('OPTIONS /images/:imageId DELETE preflight allows Authorization header', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, {
        path: '/images/test-image-id',
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'DELETE',
            'Access-Control-Request-Headers': 'authorization',
        },
    });

    assert.equal(parseHeaderList(response.headers['access-control-allow-headers']).includes('authorization'), true);
});

test('OPTIONS /images/:imageId DELETE preflight does not call authProvider.requireUser', async () => {
    const container = createFakeContainer();
    const app = getCreateApp()({ container });

    await request(app, {
        path: '/images/test-image-id',
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'DELETE',
            'Access-Control-Request-Headers': 'authorization',
        },
    });

    assert.equal(container.calls.some((call) => call.method === 'requireUser'), false);
});

test('OPTIONS /images/:imageId/visibility PATCH preflight allows PATCH method', async () => {
    const container = createFakeContainer();
    const app = getCreateApp()({ container });

    const response = await request(app, {
        path: '/images/test-image-id/visibility',
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'PATCH',
            'Access-Control-Request-Headers': 'authorization,content-type',
        },
    });

    assert.equal(response.statusCode, 204);
    assert.equal(parseHeaderList(response.headers['access-control-allow-methods']).includes('patch'), true);
    assert.equal(parseHeaderList(response.headers['access-control-allow-headers']).includes('authorization'), true);
    assert.equal(container.calls.some((call) => call.method === 'requireUser'), false);
});

test('DELETE /images/:imageId still calls authProvider.requireUser', async () => {
    const container = createFakeContainer();
    const app = getCreateApp()({ container });

    await request(app, { path: '/images/image-1', method: 'DELETE' });

    assert.equal(container.calls.some((call) => call.method === 'requireUser'), true);
});

test('canonical routes use injected fake dependencies', async () => {
    const container = createFakeContainer();
    const app = getCreateApp()({ container });

    await request(app, { path: '/images/public?limit=1' });
    await request(app, { path: '/images/me' });
    await request(app, { path: '/images/image-1', method: 'DELETE' });

    assert.deepEqual(container.calls.map((call) => call.method), [
        'listPublicImages',
        'requireUser',
        'listUserImages',
        'requireUser',
        'deleteImage',
    ]);
});

test('mounted app responds to POST /images using fake dependencies', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/images', method: 'POST' });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json, {
        image: {
            id: 'uploaded-image-1',
            imageUrl: 'http://localhost/media/uploaded-image-1.webp',
            isPublic: true,
            createdAt: '2026-01-01T00:00:00.000Z',
        },
    });
});

test('POST /images uses injected auth and upload service dependencies', async () => {
    const container = createFakeContainer();
    const app = getCreateApp()({ container });

    await request(app, { path: '/images', method: 'POST' });

    assert.deepEqual(container.calls.map((call) => call.method), [
        'requireUser',
        'uploadImage',
    ]);
});

test('createApp() without a container still creates an app without throwing', () => {
    const createApp = getCreateApp();

    assert.doesNotThrow(() => createApp());
});

test('createApp({ container }) mounts /media when container.config.storageProvider is local', async () => {
    const app = getCreateApp()({
        container: createFakeContainer({
            storageProviderName: 'local',
        }),
    });

    const response = await request(app, {
        path: '/media/users/user-1/images/image-1.webp',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'content:users/user-1/images/image-1.webp');
});

test('GET /media/... uses injected container.storageProvider', async () => {
    const container = createFakeContainer({
        storageProviderName: 'local',
    });
    const app = getCreateApp()({ container });

    await request(app, {
        path: '/media/users/user-1/images/image-1.webp',
    });

    assert.deepEqual(container.calls.filter((call) => call.method === 'objectExists' || call.method === 'createReadStream'), [
        {
            method: 'objectExists',
            storageKey: 'users/user-1/images/image-1.webp',
        },
        {
            method: 'createReadStream',
            storageKey: 'users/user-1/images/image-1.webp',
        },
    ]);
});

test('createApp({ container }) does not mount /media when storage provider is not local', async () => {
    const app = getCreateApp()({
        container: createFakeContainer({
            storageProviderName: 'firebase',
        }),
    });

    const response = await request(app, {
        path: '/media/users/user-1/images/image-1.webp',
    });

    assert.equal(response.statusCode, 404);
});

test('existing health route still works', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/health' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'OK');
});

test('legacy route modules are not removed', () => {
    assert.equal(typeof createImageRouter, 'function');
});

test('/resize-upload is not replaced by the new image API router', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/resize-upload', method: 'POST' });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, { error: 'No image file provided.' });
});

test('/delete-image is not replaced by the new image API router', async () => {
    const app = getCreateApp()({ container: createFakeContainer() });

    const response = await request(app, { path: '/delete-image', method: 'POST' });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body, 'Image name is required');
});

test('error handler still receives errors from canonical image routes', async () => {
    const app = getCreateApp()({
        container: createFakeContainer({
            listPublicImagesError: new Error('canonical route failed'),
        }),
    });

    const response = await request(app, { path: '/images/public' });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json, { error: 'Internal server error' });
});
