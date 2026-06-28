const test = require('node:test');
const assert = require('node:assert/strict');

const { createImagePresenter } = require('../services/imagePresenter');

const createImageRecord = (overrides = {}) => ({
    id: 'img-1',
    ownerId: 'owner-1',
    title: 'Title',
    description: 'Description',
    storageKey: 'users/owner-1/images/img-1.webp',
    thumbnailKey: 'users/owner-1/thumbnails/img-1.webp',
    mimeType: 'image/webp',
    width: 1280,
    height: 720,
    sizeBytes: 123456,
    isPublic: true,
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T01:00:00.000Z',
    deletedAt: null,
    ...overrides,
});

const createStorageProvider = ({ asyncUrls = false } = {}) => {
    const calls = [];
    return {
        calls,
        getUrl(storageKey, options) {
            calls.push({ storageKey, options });
            const url = `https://media.example.test/${encodeURIComponent(storageKey)}`;
            return asyncUrls ? Promise.resolve(url) : url;
        },
    };
};

const assertPresenterError = async (callback, messagePart) => {
    await assert.rejects(
        callback,
        (error) => error instanceof Error && error.message.includes(messagePart),
    );
};

test('creates an image presenter', () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    assert.equal(typeof presenter.toImageDto, 'function');
    assert.equal(typeof presenter.toImageDtos, 'function');
});

test('rejects missing storageProvider', () => {
    assert.throws(
        () => createImagePresenter(),
        /storageProvider/,
    );
});

test('rejects missing storageProvider.getUrl', () => {
    assert.throws(
        () => createImagePresenter({ storageProvider: {} }),
        /storageProvider\.getUrl/,
    );
});

test('rejects missing image record', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    await assertPresenterError(() => presenter.toImageDto(), 'imageRecord');
});

test('rejects missing image id', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    await assertPresenterError(() => presenter.toImageDto(createImageRecord({ id: '' })), 'imageRecord.id');
});

test('rejects missing image storageKey', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    await assertPresenterError(() => presenter.toImageDto(createImageRecord({ storageKey: '' })), 'imageRecord.storageKey');
});

test('rejects missing image createdAt', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    await assertPresenterError(() => presenter.toImageDto(createImageRecord({ createdAt: '' })), 'imageRecord.createdAt');
});

test('maps a full image record to a frontend DTO', async () => {
    const storageProvider = createStorageProvider();
    const presenter = createImagePresenter({ storageProvider });

    const dto = await presenter.toImageDto(createImageRecord());

    assert.deepEqual(dto, {
        id: 'img-1',
        ownerId: 'owner-1',
        title: 'Title',
        description: 'Description',
        imageUrl: 'https://media.example.test/users%2Fowner-1%2Fimages%2Fimg-1.webp',
        thumbnailUrl: 'https://media.example.test/users%2Fowner-1%2Fthumbnails%2Fimg-1.webp',
        width: 1280,
        height: 720,
        sizeBytes: 123456,
        mimeType: 'image/webp',
        isPublic: true,
        isArchived: false,
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T01:00:00.000Z',
    });
});

test('generates imageUrl from storageProvider.getUrl', async () => {
    const storageProvider = createStorageProvider();
    const presenter = createImagePresenter({ storageProvider });

    const dto = await presenter.toImageDto(createImageRecord());

    assert.equal(dto.imageUrl, 'https://media.example.test/users%2Fowner-1%2Fimages%2Fimg-1.webp');
    assert.equal(storageProvider.calls[0].storageKey, 'users/owner-1/images/img-1.webp');
});

test('generates thumbnailUrl when thumbnailKey exists', async () => {
    const storageProvider = createStorageProvider();
    const presenter = createImagePresenter({ storageProvider });

    const dto = await presenter.toImageDto(createImageRecord());

    assert.equal(dto.thumbnailUrl, 'https://media.example.test/users%2Fowner-1%2Fthumbnails%2Fimg-1.webp');
    assert.equal(storageProvider.calls[1].storageKey, 'users/owner-1/thumbnails/img-1.webp');
});

test('does not generate thumbnailUrl when thumbnailKey is missing', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ thumbnailKey: null }));

    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'thumbnailUrl'), false);
});

test('does not call getUrl for a thumbnail when thumbnailKey is missing', async () => {
    const storageProvider = createStorageProvider();
    const presenter = createImagePresenter({ storageProvider });

    await presenter.toImageDto(createImageRecord({ thumbnailKey: undefined }));

    assert.equal(storageProvider.calls.length, 1);
});

test('supports getUrl returning a Promise', async () => {
    const presenter = createImagePresenter({
        storageProvider: createStorageProvider({ asyncUrls: true }),
    });

    const dto = await presenter.toImageDto(createImageRecord());

    assert.equal(dto.imageUrl, 'https://media.example.test/users%2Fowner-1%2Fimages%2Fimg-1.webp');
});

test('supports getUrl returning a string', async () => {
    const presenter = createImagePresenter({
        storageProvider: createStorageProvider({ asyncUrls: false }),
    });

    const dto = await presenter.toImageDto(createImageRecord());

    assert.equal(dto.imageUrl, 'https://media.example.test/users%2Fowner-1%2Fimages%2Fimg-1.webp');
});

test('passes visibility: public for public images', async () => {
    const storageProvider = createStorageProvider();
    const presenter = createImagePresenter({ storageProvider });

    await presenter.toImageDto(createImageRecord({ isPublic: true }));

    assert.equal(storageProvider.calls[0].options.visibility, 'public');
});

test('passes visibility: private for private images', async () => {
    const storageProvider = createStorageProvider();
    const presenter = createImagePresenter({ storageProvider });

    await presenter.toImageDto(createImageRecord({ isPublic: false }));

    assert.equal(storageProvider.calls[0].options.visibility, 'private');
});

test('passes kind: image for main image URLs', async () => {
    const storageProvider = createStorageProvider();
    const presenter = createImagePresenter({ storageProvider });

    await presenter.toImageDto(createImageRecord());

    assert.equal(storageProvider.calls[0].options.kind, 'image');
});

test('passes kind: thumbnail for thumbnail URLs', async () => {
    const storageProvider = createStorageProvider();
    const presenter = createImagePresenter({ storageProvider });

    await presenter.toImageDto(createImageRecord());

    assert.equal(storageProvider.calls[1].options.kind, 'thumbnail');
});

test('converts isPublic to a boolean', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ isPublic: 1 }));

    assert.equal(dto.isPublic, true);
    assert.equal(typeof dto.isPublic, 'boolean');
});

test('converts archivedAt to isArchived boolean', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const archivedDto = await presenter.toImageDto(createImageRecord({
        archivedAt: '2026-06-23T00:00:00.000Z',
    }));
    const activeDto = await presenter.toImageDto(createImageRecord({ archivedAt: null }));

    assert.equal(archivedDto.isArchived, true);
    assert.equal(activeDto.isArchived, false);
});

test('preserves archivedAt when present', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({
        archivedAt: '2026-06-23T00:00:00.000Z',
    }));

    assert.equal(dto.archivedAt, '2026-06-23T00:00:00.000Z');
});

test('preserves ownerId', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ ownerId: 'owner-2' }));

    assert.equal(dto.ownerId, 'owner-2');
});

test('preserves title when present', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ title: 'A title' }));

    assert.equal(dto.title, 'A title');
});

test('preserves description when present', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ description: 'A description' }));

    assert.equal(dto.description, 'A description');
});

test('preserves width, height, sizeBytes, and mimeType when present', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({
        width: 640,
        height: 480,
        sizeBytes: 1000,
        mimeType: 'image/jpeg',
    }));

    assert.equal(dto.width, 640);
    assert.equal(dto.height, 480);
    assert.equal(dto.sizeBytes, 1000);
    assert.equal(dto.mimeType, 'image/jpeg');
});

test('preserves createdAt', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ createdAt: '2026-01-01T00:00:00.000Z' }));

    assert.equal(dto.createdAt, '2026-01-01T00:00:00.000Z');
});

test('preserves updatedAt when present', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ updatedAt: '2026-01-02T00:00:00.000Z' }));

    assert.equal(dto.updatedAt, '2026-01-02T00:00:00.000Z');
});

test('omits optional fields when their values are null or undefined', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({
        ownerId: null,
        title: null,
        description: undefined,
        thumbnailKey: null,
        width: null,
        height: undefined,
        sizeBytes: null,
        mimeType: undefined,
        updatedAt: null,
    }));

    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'ownerId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'title'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'description'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'thumbnailUrl'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'width'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'height'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'sizeBytes'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'mimeType'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'updatedAt'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'archivedAt'), false);
});

test('does not expose storageKey', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord());

    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'storageKey'), false);
});

test('does not expose thumbnailKey', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord());

    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'thumbnailKey'), false);
});

test('does not expose deletedAt', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ deletedAt: '2026-01-03T00:00:00.000Z' }));

    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'deletedAt'), false);
});

test('does not expose originalStorageKey', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ originalStorageKey: 'internal/original.webp' }));

    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'originalStorageKey'), false);
});

test('ignores preexisting imageUrl on the internal record', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ imageUrl: 'https://internal.example/image.webp' }));

    assert.notEqual(dto.imageUrl, 'https://internal.example/image.webp');
    assert.equal(dto.imageUrl, 'https://media.example.test/users%2Fowner-1%2Fimages%2Fimg-1.webp');
});

test('ignores preexisting thumbnailUrl on the internal record', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dto = await presenter.toImageDto(createImageRecord({ thumbnailUrl: 'https://internal.example/thumb.webp' }));

    assert.notEqual(dto.thumbnailUrl, 'https://internal.example/thumb.webp');
    assert.equal(dto.thumbnailUrl, 'https://media.example.test/users%2Fowner-1%2Fthumbnails%2Fimg-1.webp');
});

test('toImageDtos maps multiple records', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dtos = await presenter.toImageDtos([
        createImageRecord({ id: 'img-1', storageKey: 'one.webp', thumbnailKey: null }),
        createImageRecord({ id: 'img-2', storageKey: 'two.webp', thumbnailKey: null }),
    ]);

    assert.equal(dtos.length, 2);
    assert.equal(dtos[0].id, 'img-1');
    assert.equal(dtos[1].id, 'img-2');
});

test('toImageDtos preserves order', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    const dtos = await presenter.toImageDtos([
        createImageRecord({ id: 'first', storageKey: 'first.webp', thumbnailKey: null }),
        createImageRecord({ id: 'second', storageKey: 'second.webp', thumbnailKey: null }),
        createImageRecord({ id: 'third', storageKey: 'third.webp', thumbnailKey: null }),
    ]);

    assert.deepEqual(dtos.map((dto) => dto.id), ['first', 'second', 'third']);
});

test('toImageDtos rejects non-array input', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });

    await assertPresenterError(() => presenter.toImageDtos({}), 'imageRecords');
});

test('does not mutate the input image record', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });
    const imageRecord = createImageRecord();
    const before = JSON.stringify(imageRecord);

    await presenter.toImageDto(imageRecord);

    assert.equal(JSON.stringify(imageRecord), before);
});

test('does not mutate the input image record array', async () => {
    const presenter = createImagePresenter({ storageProvider: createStorageProvider() });
    const imageRecords = [
        createImageRecord({ id: 'img-1', storageKey: 'one.webp', thumbnailKey: null }),
        createImageRecord({ id: 'img-2', storageKey: 'two.webp', thumbnailKey: null }),
    ];
    const before = JSON.stringify(imageRecords);

    await presenter.toImageDtos(imageRecords);

    assert.equal(JSON.stringify(imageRecords), before);
});
