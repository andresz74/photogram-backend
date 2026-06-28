const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Readable } = require('node:stream');

const { createStaticMediaMiddleware } = require('../middleware/staticMedia');

const createStorageProvider = (overrides = {}) => {
    const calls = [];
    const existingKeys = new Set(overrides.existingKeys || [
        'users/user-1/images/image-1.webp',
        'users/user-1/images/image-1.jpg',
        'users/user-1/images/image-1.png',
        'users/user 1/images/photo one.webp',
    ]);

    return {
        calls,
        objectExists: overrides.objectExists || (async (storageKey) => {
            calls.push({ method: 'objectExists', storageKey });
            return existingKeys.has(storageKey);
        }),
        createReadStream: overrides.createReadStream || ((storageKey) => {
            calls.push({ method: 'createReadStream', storageKey });
            return Readable.from([`content:${storageKey}`]);
        }),
    };
};

const requestMiddleware = async (middleware, options) => {
    const nextCalls = [];
    const server = http.createServer((req, res) => {
        const next = (error) => {
            nextCalls.push(error);
            res.statusCode = error ? 599 : 204;
            res.end(error ? 'next:error' : 'next');
        };

        middleware(req, res, next);
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    try {
        const response = await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: options.path,
                method: options.method || 'GET',
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
            req.end();
        });

        return {
            ...response,
            nextCalls,
        };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

test('creates static media middleware', () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    assert.equal(typeof middleware, 'function');
});

test('rejects missing storageProvider', () => {
    assert.throws(
        () => createStaticMediaMiddleware(),
        /storageProvider/,
    );
});

test('rejects missing storageProvider.objectExists', () => {
    assert.throws(
        () => createStaticMediaMiddleware({
            storageProvider: {
                createReadStream: () => Readable.from([]),
            },
        }),
        /storageProvider\.objectExists/,
    );
});

test('rejects missing storageProvider.createReadStream', () => {
    assert.throws(
        () => createStaticMediaMiddleware({
            storageProvider: {
                objectExists: async () => true,
            },
        }),
        /storageProvider\.createReadStream/,
    );
});

test('streams an existing .webp object', async () => {
    const storageProvider = createStorageProvider();
    const middleware = createStaticMediaMiddleware({ storageProvider });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image-1.webp',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'content:users/user-1/images/image-1.webp');
});

test('streams an existing .jpg object', async () => {
    const storageProvider = createStorageProvider();
    const middleware = createStaticMediaMiddleware({ storageProvider });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image-1.jpg',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'content:users/user-1/images/image-1.jpg');
});

test('returns 404 when object does not exist', async () => {
    const storageProvider = createStorageProvider();
    const middleware = createStaticMediaMiddleware({ storageProvider });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/missing.webp',
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json, { error: 'Media not found' });
});

test('returns 400 for missing media path', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, { path: '/' });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, { error: 'Invalid media path' });
});

test('returns 400 for .. path segments', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/../image.webp',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, { error: 'Invalid media path' });
});

test('returns 400 for encoded traversal', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/%2e%2e/image.webp',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, { error: 'Invalid media path' });
});

test('returns 400 for backslashes', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images%5Cimage.webp',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, { error: 'Invalid media path' });
});

test('returns 400 for null bytes', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image%00.webp',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, { error: 'Invalid media path' });
});

test('returns 400 for malformed percent-encoding', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/%E0%A4%A/image.webp',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, { error: 'Invalid media path' });
});

test('returns 400 for unsupported extension', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image.txt',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, { error: 'Invalid media path' });
});

test('decodes URL-encoded path segments', async () => {
    const storageProvider = createStorageProvider();
    const middleware = createStaticMediaMiddleware({ storageProvider });

    const response = await requestMiddleware(middleware, {
        path: '/users/user%201/images/photo%20one.webp',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(storageProvider.calls[0], {
        method: 'objectExists',
        storageKey: 'users/user 1/images/photo one.webp',
    });
});

test('preserves / separators in storage keys', async () => {
    const storageProvider = createStorageProvider();
    const middleware = createStaticMediaMiddleware({ storageProvider });

    await requestMiddleware(middleware, {
        path: '/users/user-1/images/image-1.webp',
    });

    assert.equal(storageProvider.calls[0].storageKey, 'users/user-1/images/image-1.webp');
});

test('sets correct Content-Type', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image-1.png',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/png');
});

test('sets Cache-Control on successful responses', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image-1.webp',
    });

    assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('supports HEAD without a response body', async () => {
    const storageProvider = createStorageProvider();
    const middleware = createStaticMediaMiddleware({ storageProvider });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image-1.webp',
        method: 'HEAD',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '');
    assert.deepEqual(storageProvider.calls.map((call) => call.method), ['objectExists']);
});

test('calls next() for non-GET/non-HEAD methods', async () => {
    const middleware = createStaticMediaMiddleware({
        storageProvider: createStorageProvider(),
    });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image-1.webp',
        method: 'POST',
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.nextCalls.length, 1);
    assert.equal(response.nextCalls[0], undefined);
});

test('calls next(error) when createReadStream throws before headers are sent', async () => {
    const error = new Error('stream setup failed');
    const storageProvider = createStorageProvider({
        createReadStream: () => {
            throw error;
        },
    });
    const middleware = createStaticMediaMiddleware({ storageProvider });

    const response = await requestMiddleware(middleware, {
        path: '/users/user-1/images/image-1.webp',
    });

    assert.equal(response.statusCode, 599);
    assert.equal(response.nextCalls.length, 1);
    assert.equal(response.nextCalls[0], error);
});
