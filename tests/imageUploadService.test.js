const test = require('node:test');
const assert = require('node:assert/strict');

const { createImageUploadService } = require('../services/imageUploadService');

const createConfig = (overrides = {}) => ({
    imageProcessor: 'sharp',
    maxFileSizeBytes: 5 * 1024 * 1024,
    lowMemoryMode: true,
    ...overrides,
});

const createFile = (overrides = {}) => ({
    path: '/tmp/photogram-test-upload',
    mimetype: 'image/jpeg',
    size: 1234,
    originalname: 'original-name.jpg',
    ...overrides,
});

const createCurrentUser = (overrides = {}) => ({
    uid: 'user-1',
    email: 'user@example.com',
    ...overrides,
});

const createProcessedImage = (overrides = {}) => ({
    buffer: Buffer.from('processed-main'),
    mimeType: 'image/jpeg',
    extension: 'jpg',
    width: 1440,
    height: 960,
    sizeBytes: 14,
    ...overrides,
});

const createDependencies = (overrides = {}) => {
    const storageCalls = [];
    const imageServiceCalls = [];
    const processorCalls = [];
    const dto = overrides.dto || {
        id: 'image-1',
        imageUrl: 'http://localhost:3000/media/users/user-1/images/image-1.jpg',
    };

    const storageProvider = {
        calls: storageCalls,
        async saveObject(input) {
            storageCalls.push({ method: 'saveObject', input });
            if (overrides.throwOnSaveKey && input.storageKey === overrides.throwOnSaveKey) {
                throw overrides.saveError || new Error('save failed');
            }
            return {
                storageKey: input.storageKey,
                sizeBytes: Buffer.isBuffer(input.buffer) ? input.buffer.length : 10,
            };
        },
        async deleteObject(storageKey) {
            storageCalls.push({ method: 'deleteObject', storageKey });
            if (overrides.deleteError) {
                throw overrides.deleteError;
            }
            return { storageKey, deleted: true };
        },
    };

    const imageService = {
        calls: imageServiceCalls,
        async createImage(imageData, currentUser) {
            imageServiceCalls.push({ imageData, currentUser });
            if (overrides.metadataError) {
                throw overrides.metadataError;
            }
            return dto;
        },
    };

    const imageProcessor = {
        calls: processorCalls,
        async processImage(file, options) {
            processorCalls.push({ file, options });
            if (overrides.processingError) {
                throw overrides.processingError;
            }
            return overrides.processed || createProcessedImage();
        },
    };

    const service = createImageUploadService({
        config: overrides.config || createConfig(),
        storageProvider,
        imageService,
        imageProcessor,
        idGenerator: overrides.idGenerator || (() => 'image-1'),
    });

    return {
        service,
        storageProvider,
        imageService,
        imageProcessor,
        dto,
    };
};

const uploadWithDefaults = (service, overrides = {}) => service.uploadImage({
    file: overrides.file || createFile(),
    currentUser: Object.prototype.hasOwnProperty.call(overrides, 'currentUser')
        ? overrides.currentUser
        : createCurrentUser(),
    fields: overrides.fields || {},
});

test('creates an image upload service', () => {
    const { service } = createDependencies();

    assert.equal(typeof service.uploadImage, 'function');
});

test('rejects missing config', () => {
    const { storageProvider, imageService, imageProcessor } = createDependencies();

    assert.throws(
        () => createImageUploadService({ storageProvider, imageService, imageProcessor }),
        /config/,
    );
});

test('rejects missing storageProvider', () => {
    const { imageService, imageProcessor } = createDependencies();

    assert.throws(
        () => createImageUploadService({ config: createConfig(), imageService, imageProcessor }),
        /storageProvider/,
    );
});

test('rejects missing storageProvider.saveObject', () => {
    const { imageService, imageProcessor } = createDependencies();

    assert.throws(
        () => createImageUploadService({
            config: createConfig(),
            storageProvider: {},
            imageService,
            imageProcessor,
        }),
        /storageProvider\.saveObject/,
    );
});

test('rejects missing imageService', () => {
    const { storageProvider, imageProcessor } = createDependencies();

    assert.throws(
        () => createImageUploadService({ config: createConfig(), storageProvider, imageProcessor }),
        /imageService/,
    );
});

test('rejects missing imageService.createImage', () => {
    const { storageProvider, imageProcessor } = createDependencies();

    assert.throws(
        () => createImageUploadService({
            config: createConfig(),
            storageProvider,
            imageService: {},
            imageProcessor,
        }),
        /imageService\.createImage/,
    );
});

test('rejects missing imageProcessor', () => {
    const { storageProvider, imageService } = createDependencies();

    assert.throws(
        () => createImageUploadService({ config: createConfig(), storageProvider, imageService }),
        /imageProcessor\.processImage/,
    );
});

test('rejects missing authenticated user', async () => {
    const { service } = createDependencies();

    await assert.rejects(
        () => uploadWithDefaults(service, { currentUser: null }),
        /currentUser\.uid/,
    );
});

test('rejects missing file', async () => {
    const { service } = createDependencies();

    await assert.rejects(
        () => service.uploadImage({ currentUser: createCurrentUser(), fields: {} }),
        /file/,
    );
});

test('calls imageProcessor with uploaded file and config-derived options', async () => {
    const config = createConfig({ maxFileSizeBytes: 2048, lowMemoryMode: true, imageProcessor: 'jimp' });
    const { service, imageProcessor } = createDependencies({ config });
    const file = createFile();

    await uploadWithDefaults(service, { file });

    assert.equal(imageProcessor.calls[0].file, file);
    assert.equal(imageProcessor.calls[0].options.config, config);
    assert.equal(imageProcessor.calls[0].options.maxWidth, 1440);
    assert.equal(imageProcessor.calls[0].options.quality, 80);
    assert.equal(imageProcessor.calls[0].options.imageProcessor, 'jimp');
    assert.equal(imageProcessor.calls[0].options.maxFileSizeBytes, 2048);
    assert.equal(imageProcessor.calls[0].options.lowMemoryMode, true);
});

test('generates deterministic storage keys using uid and image id', async () => {
    const { service, storageProvider } = createDependencies();

    await uploadWithDefaults(service);

    assert.equal(storageProvider.calls[0].input.storageKey, 'users/user-1/images/image-1.jpg');
});

test('does not use original filename in storage key', async () => {
    const { service, storageProvider } = createDependencies();

    await uploadWithDefaults(service, {
        file: createFile({ originalname: 'do-not-use-this-name.png' }),
    });

    assert.equal(storageProvider.calls[0].input.storageKey.includes('do-not-use-this-name'), false);
});

test('saves processed main image through storageProvider.saveObject', async () => {
    const { service, storageProvider } = createDependencies();

    await uploadWithDefaults(service);

    assert.equal(storageProvider.calls[0].method, 'saveObject');
    assert.equal(storageProvider.calls[0].input.buffer.toString(), 'processed-main');
});

test('saves thumbnail when processor returns thumbnail output', async () => {
    const { service, storageProvider } = createDependencies({
        processed: createProcessedImage({
            thumbnailBuffer: Buffer.from('processed-thumb'),
            thumbnailExtension: 'webp',
            thumbnailSizeBytes: 15,
        }),
    });

    await uploadWithDefaults(service);

    assert.equal(storageProvider.calls[1].method, 'saveObject');
    assert.equal(storageProvider.calls[1].input.storageKey, 'users/user-1/thumbnails/image-1.webp');
});

test('does not save thumbnail when processor does not return thumbnail output', async () => {
    const { service, storageProvider } = createDependencies();

    await uploadWithDefaults(service);

    assert.equal(storageProvider.calls.filter((call) => call.method === 'saveObject').length, 1);
});

test('calls imageService.createImage with metadata', async () => {
    const { service, imageService } = createDependencies();

    await uploadWithDefaults(service);

    assert.deepEqual(imageService.calls[0].imageData, {
        id: 'image-1',
        title: undefined,
        description: undefined,
        storageKey: 'users/user-1/images/image-1.jpg',
        thumbnailKey: null,
        mimeType: 'image/jpeg',
        width: 1440,
        height: 960,
        sizeBytes: 14,
        isPublic: true,
        tags: [],
        tagSlugs: [],
    });
});

test('sets owner through imageService/currentUser, not request fields', async () => {
    const currentUser = createCurrentUser({ uid: 'user-1' });
    const { service, imageService } = createDependencies();

    await uploadWithDefaults(service, {
        currentUser,
        fields: { ownerId: 'attacker' },
    });

    assert.equal(Object.prototype.hasOwnProperty.call(imageService.calls[0].imageData, 'ownerId'), false);
    assert.equal(imageService.calls[0].currentUser, currentUser);
});

test('passes title and description from fields', async () => {
    const { service, imageService } = createDependencies();

    await uploadWithDefaults(service, {
        fields: {
            title: 'Test upload',
            description: 'Uploaded through provider API',
        },
    });

    assert.equal(imageService.calls[0].imageData.title, 'Test upload');
    assert.equal(imageService.calls[0].imageData.description, 'Uploaded through provider API');
});

test('defaults isPublic to true', async () => {
    const { service, imageService } = createDependencies();

    await uploadWithDefaults(service);

    assert.equal(imageService.calls[0].imageData.isPublic, true);
});

test('parses isPublic false', async () => {
    const { service, imageService } = createDependencies();

    await uploadWithDefaults(service, {
        fields: { isPublic: 'false' },
    });

    assert.equal(imageService.calls[0].imageData.isPublic, false);
});

test('passes normalized tags from fields', async () => {
    const { service, imageService } = createDependencies();

    await uploadWithDefaults(service, {
        fields: {
            tags: JSON.stringify(['#Dog', 'golden   retriever', 'New York', 'dog']),
        },
    });

    assert.deepEqual(imageService.calls[0].imageData.tags, ['Dog', 'golden retriever', 'New York']);
    assert.deepEqual(imageService.calls[0].imageData.tagSlugs, ['dog', 'golden-retriever', 'new-york']);
});

test('rejects malformed tags before storage writes', async () => {
    const { service, storageProvider } = createDependencies();

    await assert.rejects(
        () => uploadWithDefaults(service, { fields: { tags: 'dog,golden retriever' } }),
        /valid JSON/,
    );
    assert.equal(storageProvider.calls.length, 0);
});

test('rejects invalid isPublic', async () => {
    const { service, storageProvider } = createDependencies();

    await assert.rejects(
        () => uploadWithDefaults(service, { fields: { isPublic: 'yes' } }),
        /isPublic/,
    );
    assert.equal(storageProvider.calls.length, 0);
});

test('returns DTO from imageService.createImage', async () => {
    const dto = { id: 'image-1', imageUrl: 'http://localhost/media/image-1.jpg' };
    const { service } = createDependencies({ dto });

    const result = await uploadWithDefaults(service);

    assert.equal(result, dto);
});

test('does not expose storageKey in returned DTO when imageService returns safe DTO', async () => {
    const { service } = createDependencies({
        dto: { id: 'image-1', imageUrl: 'http://localhost/media/image-1.jpg' },
    });

    const result = await uploadWithDefaults(service);

    assert.equal(Object.prototype.hasOwnProperty.call(result, 'storageKey'), false);
});

test('cleans up main image if thumbnail save fails', async () => {
    const thumbnailKey = 'users/user-1/thumbnails/image-1.webp';
    const saveError = new Error('thumbnail save failed');
    const { service, storageProvider } = createDependencies({
        processed: createProcessedImage({
            thumbnailBuffer: Buffer.from('processed-thumb'),
            thumbnailExtension: 'webp',
        }),
        throwOnSaveKey: thumbnailKey,
        saveError,
    });

    await assert.rejects(
        () => uploadWithDefaults(service),
        (error) => error === saveError,
    );
    assert.deepEqual(storageProvider.calls.map((call) => `${call.method}:${call.input?.storageKey || call.storageKey}`), [
        'saveObject:users/user-1/images/image-1.jpg',
        'saveObject:users/user-1/thumbnails/image-1.webp',
        'deleteObject:users/user-1/images/image-1.jpg',
    ]);
});

test('cleans up saved objects if metadata creation fails', async () => {
    const metadataError = new Error('metadata failed');
    const { service, storageProvider } = createDependencies({
        processed: createProcessedImage({
            thumbnailBuffer: Buffer.from('processed-thumb'),
            thumbnailExtension: 'webp',
        }),
        metadataError,
    });

    await assert.rejects(
        () => uploadWithDefaults(service),
        (error) => error === metadataError,
    );
    assert.deepEqual(storageProvider.calls.map((call) => `${call.method}:${call.input?.storageKey || call.storageKey}`), [
        'saveObject:users/user-1/images/image-1.jpg',
        'saveObject:users/user-1/thumbnails/image-1.webp',
        'deleteObject:users/user-1/images/image-1.jpg',
        'deleteObject:users/user-1/thumbnails/image-1.webp',
    ]);
});

test('propagates original processing error', async () => {
    const processingError = new Error('processing failed');
    const { service } = createDependencies({ processingError });

    await assert.rejects(
        () => uploadWithDefaults(service),
        (error) => error === processingError,
    );
});

test('propagates original storage save error', async () => {
    const saveError = new Error('save failed');
    const { service } = createDependencies({
        throwOnSaveKey: 'users/user-1/images/image-1.jpg',
        saveError,
    });

    await assert.rejects(
        () => uploadWithDefaults(service),
        (error) => error === saveError,
    );
});

test('propagates original metadata error', async () => {
    const metadataError = new Error('metadata failed');
    const { service } = createDependencies({ metadataError });

    await assert.rejects(
        () => uploadWithDefaults(service),
        (error) => error === metadataError,
    );
});

test('does not mutate file', async () => {
    const { service } = createDependencies();
    const file = createFile();
    const before = JSON.stringify(file);

    await uploadWithDefaults(service, { file });

    assert.equal(JSON.stringify(file), before);
});

test('does not mutate fields', async () => {
    const { service } = createDependencies();
    const fields = { title: 'Title', isPublic: 'false' };
    const before = JSON.stringify(fields);

    await uploadWithDefaults(service, { fields });

    assert.equal(JSON.stringify(fields), before);
});

test('does not mutate currentUser', async () => {
    const { service } = createDependencies();
    const currentUser = createCurrentUser();
    const before = JSON.stringify(currentUser);

    await uploadWithDefaults(service, { currentUser });

    assert.equal(JSON.stringify(currentUser), before);
});
