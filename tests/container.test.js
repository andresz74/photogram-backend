const test = require('node:test');
const assert = require('node:assert/strict');

const { createContainer } = require('../config/container');

const createConfig = (overrides = {}) => ({
    authProvider: 'firebase',
    databaseProvider: 'sqlite',
    storageProvider: 'local',
    ...overrides,
});

const createFakeAuthProvider = (type = 'firebaseAuth') => ({
    type,
    getCurrentUser: async () => null,
    requireUser: async () => ({ uid: 'user-1' }),
});

const createFakeImageRepository = (type = 'sqliteRepository', overrides = {}) => ({
    type,
    listPublicImages: async () => [],
    listImagesByOwner: async () => [],
    findImageById: async () => null,
    createImage: async (image) => image,
    updateImageVisibility: async (imageId, ownerId, isPublic) => ({ id: imageId, ownerId, isPublic }),
    archiveImageById: async (imageId, ownerId) => ({ id: imageId, ownerId, archivedAt: '2026-01-01T00:00:00.000Z' }),
    unarchiveImageById: async (imageId, ownerId) => ({ id: imageId, ownerId, archivedAt: null }),
    deleteImageById: async (imageId) => ({ imageId, deleted: true }),
    ...overrides,
});

const createFakeStorageProvider = (type = 'localStorage', overrides = {}) => ({
    type,
    getUrl: (storageKey) => `http://localhost/media/${storageKey}`,
    saveObject: async ({ storageKey }) => ({ storageKey, sizeBytes: 10 }),
    deleteObject: async (storageKey) => ({ storageKey, deleted: true }),
    ...overrides,
});

const createCountingFactory = (providerFactory, calls) => (context) => {
    calls.push(context);
    return providerFactory();
};

const createProviderRegistry = (calls = { auth: [], repository: [], storage: [] }) => ({
    authProviders: {
        firebase: createCountingFactory(() => createFakeAuthProvider('firebaseAuth'), calls.auth),
        local: createCountingFactory(() => createFakeAuthProvider('localAuth'), calls.auth),
    },
    imageRepositories: {
        firebase: createCountingFactory(() => createFakeImageRepository('firebaseRepository'), calls.repository),
        sqlite: createCountingFactory(() => createFakeImageRepository('sqliteRepository'), calls.repository),
    },
    storageProviders: {
        firebase: createCountingFactory(() => createFakeStorageProvider('firebaseStorage'), calls.storage),
        local: createCountingFactory(() => createFakeStorageProvider('localStorage'), calls.storage),
    },
});

const assertContainerError = (callback, messagePart) => {
    assert.throws(
        callback,
        (error) => error instanceof Error && error.message.includes(messagePart),
    );
};

test('creates a container with selected providers', () => {
    const calls = { auth: [], repository: [], storage: [] };
    const config = createConfig();
    const registry = createProviderRegistry(calls);

    const container = createContainer(config, registry);

    assert.equal(container.config, config);
    assert.equal(container.authProvider.type, 'firebaseAuth');
    assert.equal(container.imageRepository.type, 'sqliteRepository');
    assert.equal(container.storageProvider.type, 'localStorage');
    assert.equal(typeof container.imagePresenter.toImageDto, 'function');
    assert.equal(typeof container.imageService.listPublicImages, 'function');
    assert.equal(typeof container.imageUploadService.uploadImage, 'function');
});

test('returns config', () => {
    const config = createConfig();
    const container = createContainer(config, createProviderRegistry());

    assert.equal(container.config, config);
});

test('returns authProvider', () => {
    const container = createContainer(createConfig(), createProviderRegistry());

    assert.equal(container.authProvider.type, 'firebaseAuth');
});

test('returns imageRepository', () => {
    const container = createContainer(createConfig(), createProviderRegistry());

    assert.equal(container.imageRepository.type, 'sqliteRepository');
});

test('returns storageProvider', () => {
    const container = createContainer(createConfig(), createProviderRegistry());

    assert.equal(container.storageProvider.type, 'localStorage');
});

test('returns imagePresenter', () => {
    const container = createContainer(createConfig(), createProviderRegistry());

    assert.equal(typeof container.imagePresenter.toImageDto, 'function');
    assert.equal(typeof container.imagePresenter.toImageDtos, 'function');
});

test('returns imageService', () => {
    const container = createContainer(createConfig(), createProviderRegistry());

    assert.equal(typeof container.imageService.listPublicImages, 'function');
    assert.equal(typeof container.imageService.listUserImages, 'function');
    assert.equal(typeof container.imageService.findImageById, 'function');
    assert.equal(typeof container.imageService.createImage, 'function');
    assert.equal(typeof container.imageService.updateImageVisibility, 'function');
    assert.equal(typeof container.imageService.archiveImage, 'function');
    assert.equal(typeof container.imageService.unarchiveImage, 'function');
    assert.equal(typeof container.imageService.deleteImage, 'function');
});

test('returns imageUploadService', () => {
    const container = createContainer(createConfig(), createProviderRegistry());

    assert.equal(typeof container.imageUploadService.uploadImage, 'function');
});

test('selected auth provider factory is called once', () => {
    const calls = { auth: [], repository: [], storage: [] };
    createContainer(createConfig(), createProviderRegistry(calls));

    assert.equal(calls.auth.length, 1);
});

test('selected image repository factory is called once', () => {
    const calls = { auth: [], repository: [], storage: [] };
    createContainer(createConfig(), createProviderRegistry(calls));

    assert.equal(calls.repository.length, 1);
});

test('selected storage provider factory is called once', () => {
    const calls = { auth: [], repository: [], storage: [] };
    createContainer(createConfig(), createProviderRegistry(calls));

    assert.equal(calls.storage.length, 1);
});

test('passes the same normalized config object to every selected provider factory', () => {
    const calls = { auth: [], repository: [], storage: [] };
    const config = createConfig();
    createContainer(config, createProviderRegistry(calls));

    assert.equal(calls.auth[0].config, config);
    assert.equal(calls.repository[0].config, config);
    assert.equal(calls.storage[0].config, config);
});

test('supports the MVP provider combination', () => {
    const container = createContainer(
        createConfig({
            authProvider: 'firebase',
            databaseProvider: 'sqlite',
            storageProvider: 'local',
        }),
        createProviderRegistry(),
    );

    assert.equal(container.authProvider.type, 'firebaseAuth');
    assert.equal(container.imageRepository.type, 'sqliteRepository');
    assert.equal(container.storageProvider.type, 'localStorage');
    assert.equal(typeof container.imagePresenter.toImageDto, 'function');
    assert.equal(typeof container.imageService.createImage, 'function');
    assert.equal(typeof container.imageUploadService.uploadImage, 'function');
});

test('supports the all-Firebase provider combination when fake registry entries exist', () => {
    const container = createContainer(
        createConfig({
            authProvider: 'firebase',
            databaseProvider: 'firebase',
            storageProvider: 'firebase',
        }),
        createProviderRegistry(),
    );

    assert.equal(container.authProvider.type, 'firebaseAuth');
    assert.equal(container.imageRepository.type, 'firebaseRepository');
    assert.equal(container.storageProvider.type, 'firebaseStorage');
    assert.equal(typeof container.imageService.listPublicImages, 'function');
});

test('supports the all-local provider combination when fake registry entries exist', () => {
    const container = createContainer(
        createConfig({
            authProvider: 'local',
            databaseProvider: 'sqlite',
            storageProvider: 'local',
        }),
        createProviderRegistry(),
    );

    assert.equal(container.authProvider.type, 'localAuth');
    assert.equal(container.imageRepository.type, 'sqliteRepository');
    assert.equal(container.storageProvider.type, 'localStorage');
    assert.equal(typeof container.imageService.listUserImages, 'function');
});

test('rejects missing config', () => {
    assertContainerError(() => createContainer(undefined, createProviderRegistry()), 'config');
});

test('rejects missing providerRegistry', () => {
    assertContainerError(() => createContainer(createConfig()), 'providerRegistry');
});

test('rejects missing authProviders registry', () => {
    assertContainerError(
        () => createContainer(createConfig(), {
            imageRepositories: {},
            storageProviders: {},
        }),
        'providerRegistry.authProviders',
    );
});

test('rejects missing imageRepositories registry', () => {
    assertContainerError(
        () => createContainer(createConfig(), {
            authProviders: {},
            storageProviders: {},
        }),
        'providerRegistry.imageRepositories',
    );
});

test('rejects missing storageProviders registry', () => {
    assertContainerError(
        () => createContainer(createConfig(), {
            authProviders: {},
            imageRepositories: {},
        }),
        'providerRegistry.storageProviders',
    );
});

test('rejects missing selected auth provider and includes AUTH_PROVIDER', () => {
    const registry = createProviderRegistry();
    delete registry.authProviders.firebase;

    assertContainerError(() => createContainer(createConfig(), registry), 'AUTH_PROVIDER');
});

test('rejects missing selected image repository and includes DATABASE_PROVIDER', () => {
    const registry = createProviderRegistry();
    delete registry.imageRepositories.sqlite;

    assertContainerError(() => createContainer(createConfig(), registry), 'DATABASE_PROVIDER');
});

test('rejects missing selected storage provider and includes STORAGE_PROVIDER', () => {
    const registry = createProviderRegistry();
    delete registry.storageProviders.local;

    assertContainerError(() => createContainer(createConfig(), registry), 'STORAGE_PROVIDER');
});

test('rejects provider registry values that are not functions', () => {
    const registry = createProviderRegistry();
    registry.authProviders.firebase = {};

    assertContainerError(() => createContainer(createConfig(), registry), 'must be a function');
});

test('rejects provider factories that return non-object values', () => {
    const registry = createProviderRegistry();
    registry.authProviders.firebase = () => null;

    assertContainerError(() => createContainer(createConfig(), registry), 'must return an object');
});

test('rejects a storage provider missing getUrl', () => {
    const registry = createProviderRegistry();
    registry.storageProviders.local = () => createFakeStorageProvider('localStorage', { getUrl: undefined });

    assertContainerError(() => createContainer(createConfig(), registry), 'storageProvider.getUrl');
});

test('rejects dependencies that cannot create imageService', () => {
    const registry = createProviderRegistry();
    registry.storageProviders.local = () => createFakeStorageProvider('localStorage', { deleteObject: undefined });

    assertContainerError(() => createContainer(createConfig(), registry), 'storageProvider.deleteObject');
});

test('does not mutate the config object', () => {
    const config = createConfig();
    const before = JSON.stringify(config);

    createContainer(config, createProviderRegistry());

    assert.equal(JSON.stringify(config), before);
});

test('does not mutate the provider registry', () => {
    const registry = createProviderRegistry();
    const beforeAuthKeys = Object.keys(registry.authProviders);
    const beforeRepositoryKeys = Object.keys(registry.imageRepositories);
    const beforeStorageKeys = Object.keys(registry.storageProviders);

    createContainer(createConfig(), registry);

    assert.deepEqual(Object.keys(registry.authProviders), beforeAuthKeys);
    assert.deepEqual(Object.keys(registry.imageRepositories), beforeRepositoryKeys);
    assert.deepEqual(Object.keys(registry.storageProviders), beforeStorageKeys);
});
