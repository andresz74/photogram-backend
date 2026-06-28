const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');

const { createLocalStorageProvider } = require('../storage/localStorageProvider');

const createTempContext = async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'photogram-local-storage-'));
    return {
        root,
        config: {
            localStorageRoot: root,
            publicMediaBaseUrl: 'http://localhost:3000/media',
        },
        cleanup: () => fs.rm(root, { recursive: true, force: true }),
    };
};

const readStreamToString = async (readableStream) => {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
};

const assertProviderError = async (callback, messagePart) => {
    await assert.rejects(
        callback,
        (error) => error instanceof Error && error.message.includes(messagePart),
    );
};

test('creates a local storage provider', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });

        assert.equal(typeof provider.saveObject, 'function');
        assert.equal(typeof provider.deleteObject, 'function');
        assert.equal(typeof provider.getUrl, 'function');
        assert.equal(typeof provider.createReadStream, 'function');
        assert.equal(typeof provider.objectExists, 'function');
    } finally {
        await context.cleanup();
    }
});

test('rejects missing config', () => {
    assert.throws(
        () => createLocalStorageProvider(),
        /config/,
    );
});

test('rejects missing config.localStorageRoot', () => {
    assert.throws(
        () => createLocalStorageProvider({ config: { publicMediaBaseUrl: 'http://localhost/media' } }),
        /config\.localStorageRoot/,
    );
});

test('rejects missing config.publicMediaBaseUrl', () => {
    assert.throws(
        () => createLocalStorageProvider({ config: { localStorageRoot: '/tmp/images' } }),
        /config\.publicMediaBaseUrl/,
    );
});

test('saves a readable stream to disk', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await provider.saveObject({
            storageKey: 'users/u1/images/a.txt',
            readableStream: Readable.from(['stream-data']),
        });

        const content = await fs.readFile(path.join(context.root, 'users/u1/images/a.txt'), 'utf8');
        assert.equal(content, 'stream-data');
    } finally {
        await context.cleanup();
    }
});

test('saves a buffer to disk', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await provider.saveObject({
            storageKey: 'users/u1/images/b.txt',
            buffer: Buffer.from('buffer-data'),
        });

        const content = await fs.readFile(path.join(context.root, 'users/u1/images/b.txt'), 'utf8');
        assert.equal(content, 'buffer-data');
    } finally {
        await context.cleanup();
    }
});

test('creates nested parent directories', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await provider.saveObject({
            storageKey: 'a/b/c/d.txt',
            buffer: Buffer.from('nested'),
        });

        const stats = await fs.stat(path.join(context.root, 'a/b/c'));
        assert.equal(stats.isDirectory(), true);
    } finally {
        await context.cleanup();
    }
});

test('returns storageKey and sizeBytes from saveObject', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        const result = await provider.saveObject({
            storageKey: 'image.txt',
            buffer: Buffer.from('12345'),
        });

        assert.deepEqual(result, {
            storageKey: 'image.txt',
            sizeBytes: 5,
        });
    } finally {
        await context.cleanup();
    }
});

test('rejects save when neither readableStream nor buffer is provided', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await assertProviderError(
            () => provider.saveObject({ storageKey: 'missing.txt' }),
            'readableStream or buffer',
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects empty storage keys', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await assertProviderError(
            () => provider.saveObject({ storageKey: '', buffer: Buffer.from('x') }),
            'storageKey',
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects absolute storage keys', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await assertProviderError(
            () => provider.saveObject({ storageKey: path.resolve('/tmp/escape.txt'), buffer: Buffer.from('x') }),
            'absolute paths',
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects storage keys with .. segments', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await assertProviderError(
            () => provider.saveObject({ storageKey: 'users/../escape.txt', buffer: Buffer.from('x') }),
            '.. path segments',
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects storage keys with backslashes', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await assertProviderError(
            () => provider.saveObject({ storageKey: 'users\\u1\\image.txt', buffer: Buffer.from('x') }),
            'backslashes',
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects storage keys with null bytes', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await assertProviderError(
            () => provider.saveObject({ storageKey: 'image\0.txt', buffer: Buffer.from('x') }),
            'null bytes',
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects storage keys ending in /', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await assertProviderError(
            () => provider.saveObject({ storageKey: 'users/u1/', buffer: Buffer.from('x') }),
            'end with /',
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects path traversal that would escape LOCAL_STORAGE_ROOT', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await assertProviderError(
            () => provider.saveObject({ storageKey: 'safe/%2e%2e/escape.txt/../../escape.txt', buffer: Buffer.from('x') }),
            '.. path segments',
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects overwriting an existing object by default', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await provider.saveObject({ storageKey: 'same.txt', buffer: Buffer.from('first') });

        await assertProviderError(
            () => provider.saveObject({ storageKey: 'same.txt', buffer: Buffer.from('second') }),
            'already exists',
        );
    } finally {
        await context.cleanup();
    }
});

test('overwrites an existing object when overwrite === true', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await provider.saveObject({ storageKey: 'same.txt', buffer: Buffer.from('first') });
        await provider.saveObject({ storageKey: 'same.txt', buffer: Buffer.from('second'), overwrite: true });

        const content = await fs.readFile(path.join(context.root, 'same.txt'), 'utf8');
        assert.equal(content, 'second');
    } finally {
        await context.cleanup();
    }
});

test('deletes an existing object and returns deleted: true', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await provider.saveObject({ storageKey: 'delete-me.txt', buffer: Buffer.from('x') });

        const result = await provider.deleteObject('delete-me.txt');

        assert.deepEqual(result, { storageKey: 'delete-me.txt', deleted: true });
    } finally {
        await context.cleanup();
    }
});

test('deleting a missing object returns deleted: false', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });

        const result = await provider.deleteObject('missing.txt');

        assert.deepEqual(result, { storageKey: 'missing.txt', deleted: false });
    } finally {
        await context.cleanup();
    }
});

test('objectExists returns true for an existing file', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await provider.saveObject({ storageKey: 'exists.txt', buffer: Buffer.from('x') });

        assert.equal(await provider.objectExists('exists.txt'), true);
    } finally {
        await context.cleanup();
    }
});

test('objectExists returns false for a missing file', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });

        assert.equal(await provider.objectExists('missing.txt'), false);
    } finally {
        await context.cleanup();
    }
});

test('createReadStream streams the stored content without buffering the whole file', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });
        await provider.saveObject({ storageKey: 'read.txt', buffer: Buffer.from('read-stream-content') });

        const readableStream = provider.createReadStream('read.txt');
        assert.equal(typeof readableStream.pipe, 'function');
        assert.equal(await readStreamToString(readableStream), 'read-stream-content');
    } finally {
        await context.cleanup();
    }
});

test('getUrl joins publicMediaBaseUrl and storageKey', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });

        assert.equal(provider.getUrl('users/u1/images/photo.webp'), 'http://localhost:3000/media/users/u1/images/photo.webp');
    } finally {
        await context.cleanup();
    }
});

test('getUrl removes trailing slash from publicMediaBaseUrl', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({
            config: {
                localStorageRoot: context.root,
                publicMediaBaseUrl: 'http://localhost:3000/media///',
            },
        });

        assert.equal(provider.getUrl('photo.webp'), 'http://localhost:3000/media/photo.webp');
    } finally {
        await context.cleanup();
    }
});

test('getUrl URL-encodes path segments while preserving /', async () => {
    const context = await createTempContext();
    try {
        const provider = createLocalStorageProvider({ config: context.config });

        assert.equal(
            provider.getUrl('users/user 1/images/photo one.webp'),
            'http://localhost:3000/media/users/user%201/images/photo%20one.webp',
        );
    } finally {
        await context.cleanup();
    }
});
