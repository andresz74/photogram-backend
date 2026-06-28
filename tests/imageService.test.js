const test = require('node:test');
const assert = require('node:assert/strict');

const { createImageService } = require('../services/imageService');

const createImageRecord = (overrides = {}) => ({
    id: 'img-1',
    ownerId: 'user-1',
    storageKey: 'users/user-1/images/img-1.webp',
    thumbnailKey: 'users/user-1/thumbnails/img-1.webp',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
});

const createDto = (imageRecord) => ({
    id: imageRecord.id,
    ownerId: imageRecord.ownerId,
    imageUrl: `https://media.example.test/${imageRecord.id}`,
    createdAt: imageRecord.createdAt,
});

const createFakeRepository = (state = {}, operations = []) => {
    const calls = [];
    const repositoryState = {
        publicImages: state.publicImages || [createImageRecord({ id: 'public-1' })],
        ownerImages: state.ownerImages || [createImageRecord({ id: 'owner-1' })],
        foundImage: state.foundImage === undefined ? createImageRecord() : state.foundImage,
        createdImage: state.createdImage || createImageRecord({ id: 'created-1' }),
        visibilityImage: state.visibilityImage === undefined
            ? createImageRecord({ id: 'visibility-1', isPublic: false })
            : state.visibilityImage,
        archivedImage: state.archivedImage === undefined
            ? createImageRecord({
                id: 'archived-1',
                archivedAt: '2026-06-23T00:00:00.000Z',
            })
            : state.archivedImage,
        unarchivedImage: state.unarchivedImage === undefined
            ? createImageRecord({ id: 'unarchived-1', archivedAt: null })
            : state.unarchivedImage,
        deleteResult: state.deleteResult === undefined ? { deleted: true } : state.deleteResult,
    };

    return {
        calls,
        async listPublicImages(options) {
            operations.push('listPublicImages');
            calls.push({ method: 'listPublicImages', options });
            return repositoryState.publicImages;
        },
        async listImagesByOwner(ownerId, options) {
            operations.push('listImagesByOwner');
            calls.push({ method: 'listImagesByOwner', ownerId, options });
            return repositoryState.ownerImages;
        },
        async findImageById(imageId, options) {
            operations.push(`findImageById:${imageId}`);
            calls.push({ method: 'findImageById', imageId, options });
            return repositoryState.foundImage;
        },
        async createImage(imageData) {
            operations.push('createImage');
            calls.push({ method: 'createImage', imageData });
            return repositoryState.createdImage;
        },
        async updateImageVisibility(imageId, ownerId, isPublic) {
            operations.push(`updateImageVisibility:${imageId}:${ownerId}:${isPublic}`);
            calls.push({ method: 'updateImageVisibility', imageId, ownerId, isPublic });
            return repositoryState.visibilityImage;
        },
        async archiveImageById(imageId, ownerId) {
            operations.push(`archiveImageById:${imageId}:${ownerId}`);
            calls.push({ method: 'archiveImageById', imageId, ownerId });
            return repositoryState.archivedImage;
        },
        async unarchiveImageById(imageId, ownerId) {
            operations.push(`unarchiveImageById:${imageId}:${ownerId}`);
            calls.push({ method: 'unarchiveImageById', imageId, ownerId });
            return repositoryState.unarchivedImage;
        },
        async deleteImageById(imageId, ownerId) {
            operations.push(`deleteImageById:${imageId}:${ownerId}`);
            calls.push({ method: 'deleteImageById', imageId, ownerId });
            return repositoryState.deleteResult;
        },
    };
};

const createFakeStorageProvider = (state = {}, operations = []) => {
    const calls = [];
    return {
        calls,
        async deleteObject(storageKey) {
            operations.push(`deleteObject:${storageKey}`);
            calls.push({ storageKey });

            if (state.throwForStorageKey === storageKey) {
                throw new Error(`delete failed for ${storageKey}`);
            }

            return {
                storageKey,
                deleted: state.deleted === undefined ? true : state.deleted,
            };
        },
    };
};

const createFakePresenter = (operations = []) => {
    const calls = [];
    return {
        calls,
        async toImageDto(imageRecord) {
            operations.push(`toImageDto:${imageRecord.id}`);
            calls.push({ method: 'toImageDto', imageRecord });
            return createDto(imageRecord);
        },
        async toImageDtos(imageRecords) {
            operations.push('toImageDtos');
            calls.push({ method: 'toImageDtos', imageRecords });
            return imageRecords.map(createDto);
        },
    };
};

const createDependencies = (state = {}) => {
    const operations = [];
    const imageRepository = createFakeRepository(state.repository, operations);
    const storageProvider = createFakeStorageProvider(state.storage, operations);
    const imagePresenter = createFakePresenter(operations);

    return {
        operations,
        imageRepository,
        storageProvider,
        imagePresenter,
    };
};

const createServiceContext = (state = {}) => {
    const dependencies = createDependencies(state);
    return {
        ...dependencies,
        service: createImageService(dependencies),
    };
};

const assertHttpError = async (callback, statusCode, code) => {
    await assert.rejects(
        callback,
        (error) => error instanceof Error
            && error.statusCode === statusCode
            && error.code === code,
    );
};

test('creates an image service', () => {
    const { service } = createServiceContext();

    assert.equal(typeof service.listPublicImages, 'function');
    assert.equal(typeof service.listUserImages, 'function');
    assert.equal(typeof service.findImageById, 'function');
    assert.equal(typeof service.createImage, 'function');
    assert.equal(typeof service.deleteImage, 'function');
});

test('rejects missing imageRepository', () => {
    const { storageProvider, imagePresenter } = createDependencies();

    assert.throws(
        () => createImageService({ storageProvider, imagePresenter }),
        /imageRepository/,
    );
});

test('rejects missing storageProvider', () => {
    const { imageRepository, imagePresenter } = createDependencies();

    assert.throws(
        () => createImageService({ imageRepository, imagePresenter }),
        /storageProvider/,
    );
});

test('rejects missing imagePresenter', () => {
    const { imageRepository, storageProvider } = createDependencies();

    assert.throws(
        () => createImageService({ imageRepository, storageProvider }),
        /imagePresenter/,
    );
});

test('rejects missing required repository methods', () => {
    const requiredMethods = [
        'listPublicImages',
        'listImagesByOwner',
        'findImageById',
        'createImage',
        'updateImageVisibility',
        'archiveImageById',
        'unarchiveImageById',
        'deleteImageById',
    ];

    for (const methodName of requiredMethods) {
        const dependencies = createDependencies();
        dependencies.imageRepository[methodName] = undefined;

        assert.throws(
            () => createImageService(dependencies),
            new RegExp(`imageRepository\\.${methodName}`),
        );
    }
});

test('rejects missing storageProvider.deleteObject', () => {
    const dependencies = createDependencies();
    dependencies.storageProvider.deleteObject = undefined;

    assert.throws(
        () => createImageService(dependencies),
        /storageProvider\.deleteObject/,
    );
});

test('rejects missing presenter methods', () => {
    for (const methodName of ['toImageDto', 'toImageDtos']) {
        const dependencies = createDependencies();
        dependencies.imagePresenter[methodName] = undefined;

        assert.throws(
            () => createImageService(dependencies),
            new RegExp(`imagePresenter\\.${methodName}`),
        );
    }
});

test('listPublicImages calls repository with options', async () => {
    const { service, imageRepository } = createServiceContext();
    const options = { limit: 10, offset: 2 };

    await service.listPublicImages(options);

    assert.equal(imageRepository.calls[0].method, 'listPublicImages');
    assert.equal(imageRepository.calls[0].options, options);
});

test('listPublicImages returns presenter DTOs', async () => {
    const { service } = createServiceContext({
        repository: {
            publicImages: [createImageRecord({ id: 'public-1' })],
        },
    });

    const dtos = await service.listPublicImages();

    assert.deepEqual(dtos, [
        {
            id: 'public-1',
            ownerId: 'user-1',
            imageUrl: 'https://media.example.test/public-1',
            createdAt: '2026-06-22T00:00:00.000Z',
        },
    ]);
});

test('listPublicImages does not mutate options', async () => {
    const { service } = createServiceContext();
    const options = { limit: 10 };
    const before = JSON.stringify(options);

    await service.listPublicImages(options);

    assert.equal(JSON.stringify(options), before);
});

test('listUserImages requires authenticated user', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.listUserImages(null), 401, 'UNAUTHENTICATED');
});

test('listUserImages calls repository with currentUser.uid', async () => {
    const { service, imageRepository } = createServiceContext();

    await service.listUserImages({ uid: 'user-2' }, { ownerId: 'attacker' });

    assert.equal(imageRepository.calls[0].ownerId, 'user-2');
});

test('listUserImages returns presenter DTOs', async () => {
    const { service } = createServiceContext({
        repository: {
            ownerImages: [createImageRecord({ id: 'owned-1' })],
        },
    });

    const dtos = await service.listUserImages({ uid: 'user-1' });

    assert.equal(dtos[0].id, 'owned-1');
    assert.equal(Object.prototype.hasOwnProperty.call(dtos[0], 'storageKey'), false);
});

test('listUserImages does not mutate currentUser', async () => {
    const { service } = createServiceContext();
    const currentUser = { uid: 'user-1', email: 'user@example.com' };
    const before = JSON.stringify(currentUser);

    await service.listUserImages(currentUser);

    assert.equal(JSON.stringify(currentUser), before);
});

test('listUserImages does not mutate options', async () => {
    const { service } = createServiceContext();
    const options = { limit: 5 };
    const before = JSON.stringify(options);

    await service.listUserImages({ uid: 'user-1' }, options);

    assert.equal(JSON.stringify(options), before);
});

test('findImageById requires image id', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.findImageById(''), 400, 'VALIDATION_ERROR');
});

test('findImageById returns null when repository returns null', async () => {
    const { service } = createServiceContext({
        repository: {
            foundImage: null,
        },
    });

    const dto = await service.findImageById('missing');

    assert.equal(dto, null);
});

test('findImageById returns presenter DTO when image exists', async () => {
    const { service } = createServiceContext({
        repository: {
            foundImage: createImageRecord({ id: 'img-found' }),
        },
    });

    const dto = await service.findImageById('img-found');

    assert.equal(dto.id, 'img-found');
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'storageKey'), false);
});

test('createImage requires authenticated user', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.createImage({ id: 'img-1', storageKey: 'image.webp' }, null), 401, 'UNAUTHENTICATED');
});

test('createImage requires imageData', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.createImage(null, { uid: 'user-1' }), 400, 'VALIDATION_ERROR');
});

test('createImage requires imageData.id', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.createImage({ storageKey: 'image.webp' }, { uid: 'user-1' }), 400, 'VALIDATION_ERROR');
});

test('createImage requires imageData.storageKey', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.createImage({ id: 'img-1' }, { uid: 'user-1' }), 400, 'VALIDATION_ERROR');
});

test('createImage sets ownerId from currentUser.uid', async () => {
    const { service, imageRepository } = createServiceContext();

    await service.createImage({ id: 'img-1', storageKey: 'image.webp' }, { uid: 'user-1' });

    assert.equal(imageRepository.calls[0].imageData.ownerId, 'user-1');
});

test('createImage ignores/overrides imageData.ownerId', async () => {
    const { service, imageRepository } = createServiceContext();

    await service.createImage({ id: 'img-1', ownerId: 'attacker', storageKey: 'image.webp' }, { uid: 'user-1' });

    assert.equal(imageRepository.calls[0].imageData.ownerId, 'user-1');
});

test('createImage does not mutate imageData', async () => {
    const { service } = createServiceContext();
    const imageData = { id: 'img-1', ownerId: 'attacker', storageKey: 'image.webp' };
    const before = JSON.stringify(imageData);

    await service.createImage(imageData, { uid: 'user-1' });

    assert.equal(JSON.stringify(imageData), before);
});

test('createImage returns presenter DTO', async () => {
    const { service } = createServiceContext({
        repository: {
            createdImage: createImageRecord({ id: 'created-1' }),
        },
    });

    const dto = await service.createImage({ id: 'created-1', storageKey: 'image.webp' }, { uid: 'user-1' });

    assert.equal(dto.id, 'created-1');
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'storageKey'), false);
});

test('updateImageVisibility requires authenticated user', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.updateImageVisibility('img-1', null, false), 401, 'UNAUTHENTICATED');
});

test('updateImageVisibility requires boolean isPublic', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.updateImageVisibility('img-1', { uid: 'user-1' }, 'false'), 400, 'VALIDATION_ERROR');
});

test('updateImageVisibility uses currentUser.uid', async () => {
    const { service, imageRepository } = createServiceContext();

    await service.updateImageVisibility('img-1', { uid: 'user-2' }, false);

    assert.equal(imageRepository.calls[0].method, 'updateImageVisibility');
    assert.equal(imageRepository.calls[0].ownerId, 'user-2');
    assert.equal(imageRepository.calls[0].isPublic, false);
});

test('updateImageVisibility returns presenter DTO', async () => {
    const { service } = createServiceContext({
        repository: {
            visibilityImage: createImageRecord({ id: 'visibility-1', isPublic: false }),
        },
    });

    const dto = await service.updateImageVisibility('visibility-1', { uid: 'user-1' }, false);

    assert.equal(dto.id, 'visibility-1');
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'storageKey'), false);
});

test('updateImageVisibility returns null when repository returns null', async () => {
    const { service } = createServiceContext({
        repository: {
            visibilityImage: null,
        },
    });

    assert.equal(await service.updateImageVisibility('missing', { uid: 'user-1' }, false), null);
});

test('archiveImage requires authenticated user', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.archiveImage('img-1', null), 401, 'UNAUTHENTICATED');
});

test('archiveImage uses currentUser.uid', async () => {
    const { service, imageRepository } = createServiceContext();

    await service.archiveImage('img-1', { uid: 'user-2' });

    assert.equal(imageRepository.calls[0].method, 'archiveImageById');
    assert.equal(imageRepository.calls[0].ownerId, 'user-2');
});

test('archiveImage returns presenter DTO', async () => {
    const { service } = createServiceContext({
        repository: {
            archivedImage: createImageRecord({
                id: 'archived-1',
                archivedAt: '2026-06-23T00:00:00.000Z',
            }),
        },
    });

    const dto = await service.archiveImage('archived-1', { uid: 'user-1' });

    assert.equal(dto.id, 'archived-1');
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'storageKey'), false);
});

test('unarchiveImage requires authenticated user', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.unarchiveImage('img-1', null), 401, 'UNAUTHENTICATED');
});

test('unarchiveImage uses currentUser.uid', async () => {
    const { service, imageRepository } = createServiceContext();

    await service.unarchiveImage('img-1', { uid: 'user-2' });

    assert.equal(imageRepository.calls[0].method, 'unarchiveImageById');
    assert.equal(imageRepository.calls[0].ownerId, 'user-2');
});

test('unarchiveImage returns presenter DTO', async () => {
    const { service } = createServiceContext({
        repository: {
            unarchivedImage: createImageRecord({ id: 'unarchived-1', archivedAt: null }),
        },
    });

    const dto = await service.unarchiveImage('unarchived-1', { uid: 'user-1' });

    assert.equal(dto.id, 'unarchived-1');
    assert.equal(Object.prototype.hasOwnProperty.call(dto, 'storageKey'), false);
});

test('archive and visibility updates do not delete storage objects', async () => {
    const { service, storageProvider } = createServiceContext();

    await service.updateImageVisibility('img-1', { uid: 'user-1' }, false);
    await service.archiveImage('img-1', { uid: 'user-1' });
    await service.unarchiveImage('img-1', { uid: 'user-1' });

    assert.equal(storageProvider.calls.length, 0);
});

test('deleteImage requires image id', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.deleteImage('', { uid: 'user-1' }), 400, 'VALIDATION_ERROR');
});

test('deleteImage requires authenticated user', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.deleteImage('img-1', null), 401, 'UNAUTHENTICATED');
});

test('deleteImage returns { deleted: false } when image does not exist', async () => {
    const { service, storageProvider, imageRepository } = createServiceContext({
        repository: {
            foundImage: null,
        },
    });

    const result = await service.deleteImage('missing', { uid: 'user-1' });

    assert.deepEqual(result, { imageId: 'missing', deleted: false });
    assert.equal(storageProvider.calls.length, 0);
    assert.equal(imageRepository.calls.some((call) => call.method === 'deleteImageById'), false);
});

test('deleteImage throws forbidden when owner does not match', async () => {
    const { service } = createServiceContext({
        repository: {
            foundImage: createImageRecord({ ownerId: 'other-user' }),
        },
    });

    await assertHttpError(() => service.deleteImage('img-1', { uid: 'user-1' }), 403, 'FORBIDDEN');
});

test('deleteImage deletes main storage object', async () => {
    const { service, storageProvider } = createServiceContext();

    await service.deleteImage('img-1', { uid: 'user-1' });

    assert.equal(storageProvider.calls[0].storageKey, 'users/user-1/images/img-1.webp');
});

test('deleteImage deletes thumbnail storage object when present', async () => {
    const { service, storageProvider } = createServiceContext();

    await service.deleteImage('img-1', { uid: 'user-1' });

    assert.equal(storageProvider.calls[1].storageKey, 'users/user-1/thumbnails/img-1.webp');
});

test('deleteImage does not delete thumbnail when thumbnailKey is missing', async () => {
    const { service, storageProvider } = createServiceContext({
        repository: {
            foundImage: createImageRecord({ thumbnailKey: null }),
        },
    });

    await service.deleteImage('img-1', { uid: 'user-1' });

    assert.equal(storageProvider.calls.length, 1);
});

test('deleteImage soft-deletes metadata after storage deletion', async () => {
    const { service, operations } = createServiceContext();

    await service.deleteImage('img-1', { uid: 'user-1' });

    assert.equal(operations[operations.length - 1], 'deleteImageById:img-1:user-1');
});

test('deleteImage calls storage deletion before metadata soft-delete', async () => {
    const { service, operations } = createServiceContext();

    await service.deleteImage('img-1', { uid: 'user-1' });

    assert.deepEqual(operations, [
        'findImageById:img-1',
        'deleteObject:users/user-1/images/img-1.webp',
        'deleteObject:users/user-1/thumbnails/img-1.webp',
        'deleteImageById:img-1:user-1',
    ]);
});

test('deleteImage returns repository delete result as boolean', async () => {
    const { service } = createServiceContext({
        repository: {
            deleteResult: { deleted: 1 },
        },
    });

    const result = await service.deleteImage('img-1', { uid: 'user-1' });

    assert.deepEqual(result, { imageId: 'img-1', deleted: true });
});

test('deleteImage continues metadata soft-delete when storage object is already missing', async () => {
    const { service, imageRepository } = createServiceContext({
        storage: {
            deleted: false,
        },
    });

    const result = await service.deleteImage('img-1', { uid: 'user-1' });

    assert.equal(result.deleted, true);
    assert.equal(imageRepository.calls.some((call) => call.method === 'deleteImageById'), true);
});

test('deleteImage propagates main storage deletion errors', async () => {
    const { service } = createServiceContext({
        storage: {
            throwForStorageKey: 'users/user-1/images/img-1.webp',
        },
    });

    await assert.rejects(
        () => service.deleteImage('img-1', { uid: 'user-1' }),
        /delete failed/,
    );
});

test('deleteImage propagates thumbnail deletion errors', async () => {
    const { service } = createServiceContext({
        storage: {
            throwForStorageKey: 'users/user-1/thumbnails/img-1.webp',
        },
    });

    await assert.rejects(
        () => service.deleteImage('img-1', { uid: 'user-1' }),
        /delete failed/,
    );
});

test('deleteImage does not soft-delete metadata when main storage deletion fails', async () => {
    const { service, imageRepository } = createServiceContext({
        storage: {
            throwForStorageKey: 'users/user-1/images/img-1.webp',
        },
    });

    await assert.rejects(() => service.deleteImage('img-1', { uid: 'user-1' }));

    assert.equal(imageRepository.calls.some((call) => call.method === 'deleteImageById'), false);
});

test('deleteImage does not soft-delete metadata when thumbnail deletion fails', async () => {
    const { service, imageRepository } = createServiceContext({
        storage: {
            throwForStorageKey: 'users/user-1/thumbnails/img-1.webp',
        },
    });

    await assert.rejects(() => service.deleteImage('img-1', { uid: 'user-1' }));

    assert.equal(imageRepository.calls.some((call) => call.method === 'deleteImageById'), false);
});

test('validation errors include statusCode = 400 and code = VALIDATION_ERROR', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.findImageById(''), 400, 'VALIDATION_ERROR');
});

test('missing authenticated user errors include statusCode = 401 and code = UNAUTHENTICATED', async () => {
    const { service } = createServiceContext();

    await assertHttpError(() => service.listUserImages({ uid: '' }), 401, 'UNAUTHENTICATED');
});

test('owner mismatch errors include statusCode = 403 and code = FORBIDDEN', async () => {
    const { service } = createServiceContext({
        repository: {
            foundImage: createImageRecord({ ownerId: 'other-user' }),
        },
    });

    await assertHttpError(() => service.deleteImage('img-1', { uid: 'user-1' }), 403, 'FORBIDDEN');
});

test('service does not expose internal storage keys in returned DTOs', async () => {
    const { service } = createServiceContext();

    const dtos = await service.listPublicImages();
    const created = await service.createImage({ id: 'img-1', storageKey: 'internal.webp' }, { uid: 'user-1' });
    const found = await service.findImageById('img-1');

    assert.equal(Object.prototype.hasOwnProperty.call(dtos[0], 'storageKey'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(created, 'storageKey'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(found, 'storageKey'), false);
});
