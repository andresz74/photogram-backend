const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { createContainer } = require('../config/container');
const { createProviderRegistry } = require('../config/providerRegistry');

const createFakeFirebaseAuth = () => {
    const calls = [];
    return {
        calls,
        async verifyIdToken(token) {
            calls.push(token);
            return { uid: 'user-1' };
        },
    };
};

const createTempContext = async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photogram-provider-registry-'));
    return {
        tempDir,
        cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
    };
};

const createMvpConfig = (tempDir, overrides = {}) => ({
    nodeEnv: 'test',
    port: 3000,
    authProvider: 'firebase',
    databaseProvider: 'sqlite',
    storageProvider: 'local',
    sqlitePath: path.join(tempDir, 'photogram.sqlite'),
    localStorageRoot: path.join(tempDir, 'images'),
    publicMediaBaseUrl: 'http://localhost:3000/media',
    firebaseServiceAccountPath: '/fake/service-account.json',
    firebaseStorageBucket: '',
    firebaseUrlMode: 'signed',
    firebaseSignedUrlExpiresSeconds: 300,
    lowMemoryMode: true,
    maxFileSizeMb: 5,
    resizeConcurrency: 1,
    heavyRateLimitMax: 8,
    enableDebugEndpoint: false,
    imageProcessor: 'sharp',
    ...overrides,
});

const createMvpContainerContext = async () => {
    const context = await createTempContext();
    const firebaseAuth = createFakeFirebaseAuth();
    const dependencies = { firebaseAuth };
    const registry = createProviderRegistry(dependencies);
    const config = createMvpConfig(context.tempDir);
    const container = createContainer(config, registry);

    return {
        ...context,
        config,
        dependencies,
        firebaseAuth,
        registry,
        container,
        cleanup: async () => {
            await container.imageRepository.close().catch(() => {});
            await context.cleanup();
        },
    };
};

test('creates a provider registry', () => {
    const registry = createProviderRegistry();

    assert.equal(typeof registry, 'object');
});

test('registry exposes authProviders', () => {
    const registry = createProviderRegistry();

    assert.equal(typeof registry.authProviders, 'object');
});

test('registry exposes imageRepositories', () => {
    const registry = createProviderRegistry();

    assert.equal(typeof registry.imageRepositories, 'object');
});

test('registry exposes storageProviders', () => {
    const registry = createProviderRegistry();

    assert.equal(typeof registry.storageProviders, 'object');
});

test('registry includes authProviders.firebase', () => {
    const registry = createProviderRegistry();

    assert.equal(typeof registry.authProviders.firebase, 'function');
});

test('registry includes imageRepositories.sqlite', () => {
    const registry = createProviderRegistry();

    assert.equal(typeof registry.imageRepositories.sqlite, 'function');
});

test('registry includes storageProviders.local', () => {
    const registry = createProviderRegistry();

    assert.equal(typeof registry.storageProviders.local, 'function');
});

test('registry does not include unimplemented authProviders.local', () => {
    const registry = createProviderRegistry();

    assert.equal(Object.prototype.hasOwnProperty.call(registry.authProviders, 'local'), false);
});

test('registry does not include unimplemented imageRepositories.firebase', () => {
    const registry = createProviderRegistry();

    assert.equal(Object.prototype.hasOwnProperty.call(registry.imageRepositories, 'firebase'), false);
});

test('registry does not include unimplemented storageProviders.firebase', () => {
    const registry = createProviderRegistry();

    assert.equal(Object.prototype.hasOwnProperty.call(registry.storageProviders, 'firebase'), false);
});

test('MVP provider combination can be passed to createContainer', async () => {
    const context = await createMvpContainerContext();
    try {
        assert.equal(context.container.config, context.config);
        assert.equal(typeof context.container.authProvider.getCurrentUser, 'function');
        assert.equal(typeof context.container.imageRepository.createImage, 'function');
        assert.equal(typeof context.container.storageProvider.getUrl, 'function');
        assert.equal(typeof context.container.imagePresenter.toImageDto, 'function');
        assert.equal(typeof context.container.imageService.createImage, 'function');
        assert.equal(typeof context.container.imageUploadService.uploadImage, 'function');
    } finally {
        await context.cleanup();
    }
});

test('constructed MVP container includes authProvider', async () => {
    const context = await createMvpContainerContext();
    try {
        assert.equal(typeof context.container.authProvider.getCurrentUser, 'function');
        assert.equal(typeof context.container.authProvider.requireUser, 'function');
    } finally {
        await context.cleanup();
    }
});

test('constructed MVP container includes imageRepository', async () => {
    const context = await createMvpContainerContext();
    try {
        assert.equal(typeof context.container.imageRepository.createImage, 'function');
        assert.equal(typeof context.container.imageRepository.close, 'function');
    } finally {
        await context.cleanup();
    }
});

test('constructed MVP container includes storageProvider', async () => {
    const context = await createMvpContainerContext();
    try {
        assert.equal(typeof context.container.storageProvider.saveObject, 'function');
        assert.equal(typeof context.container.storageProvider.getUrl, 'function');
    } finally {
        await context.cleanup();
    }
});

test('constructed MVP container includes imagePresenter', async () => {
    const context = await createMvpContainerContext();
    try {
        assert.equal(typeof context.container.imagePresenter.toImageDto, 'function');
        assert.equal(typeof context.container.imagePresenter.toImageDtos, 'function');
    } finally {
        await context.cleanup();
    }
});

test('constructed MVP container includes imageService', async () => {
    const context = await createMvpContainerContext();
    try {
        assert.equal(typeof context.container.imageService.listPublicImages, 'function');
        assert.equal(typeof context.container.imageService.listUserImages, 'function');
        assert.equal(typeof context.container.imageService.findImageById, 'function');
        assert.equal(typeof context.container.imageService.createImage, 'function');
        assert.equal(typeof context.container.imageService.updateImageVisibility, 'function');
        assert.equal(typeof context.container.imageService.archiveImage, 'function');
        assert.equal(typeof context.container.imageService.unarchiveImage, 'function');
        assert.equal(typeof context.container.imageService.deleteImage, 'function');
    } finally {
        await context.cleanup();
    }
});

test('constructed MVP container includes imageUploadService', async () => {
    const context = await createMvpContainerContext();
    try {
        assert.equal(typeof context.container.imageUploadService.uploadImage, 'function');
    } finally {
        await context.cleanup();
    }
});

test('constructed MVP image service can create image metadata using SQLite and return a DTO', async () => {
    const context = await createMvpContainerContext();
    try {
        const dto = await context.container.imageService.createImage({
            id: 'image-1',
            storageKey: 'users/user-1/images/image-1.webp',
            thumbnailKey: 'users/user-1/thumbnails/image-1.webp',
            isPublic: true,
        }, {
            uid: 'user-1',
        });

        assert.equal(dto.id, 'image-1');
        assert.equal(dto.ownerId, 'user-1');
        assert.equal(dto.imageUrl, 'http://localhost:3000/media/users/user-1/images/image-1.webp');
        assert.equal(dto.thumbnailUrl, 'http://localhost:3000/media/users/user-1/thumbnails/image-1.webp');
    } finally {
        await context.cleanup();
    }
});

test('returned DTO includes imageUrl', async () => {
    const context = await createMvpContainerContext();
    try {
        const dto = await context.container.imageService.createImage({
            id: 'image-1',
            storageKey: 'users/user-1/images/image-1.webp',
            isPublic: true,
        }, {
            uid: 'user-1',
        });

        assert.equal(dto.imageUrl, 'http://localhost:3000/media/users/user-1/images/image-1.webp');
    } finally {
        await context.cleanup();
    }
});

test('returned DTO does not include storageKey', async () => {
    const context = await createMvpContainerContext();
    try {
        const dto = await context.container.imageService.createImage({
            id: 'image-1',
            storageKey: 'users/user-1/images/image-1.webp',
            isPublic: true,
        }, {
            uid: 'user-1',
        });

        assert.equal(Object.prototype.hasOwnProperty.call(dto, 'storageKey'), false);
    } finally {
        await context.cleanup();
    }
});

test('returned DTO does not include thumbnailKey', async () => {
    const context = await createMvpContainerContext();
    try {
        const dto = await context.container.imageService.createImage({
            id: 'image-1',
            storageKey: 'users/user-1/images/image-1.webp',
            thumbnailKey: 'users/user-1/thumbnails/image-1.webp',
            isPublic: true,
        }, {
            uid: 'user-1',
        });

        assert.equal(Object.prototype.hasOwnProperty.call(dto, 'thumbnailKey'), false);
    } finally {
        await context.cleanup();
    }
});

test('Firebase auth provider receives injected fake firebaseAuth', async () => {
    const context = await createMvpContainerContext();
    try {
        const user = await context.container.authProvider.getCurrentUser({
            headers: {
                authorization: 'Bearer token-1',
            },
        });

        assert.equal(user.uid, 'user-1');
        assert.deepEqual(context.firebaseAuth.calls, ['token-1']);
    } finally {
        await context.cleanup();
    }
});

test('SQLite repository can be closed after registry/container construction', async () => {
    const context = await createMvpContainerContext();
    await context.container.imageRepository.close();
    await context.cleanup();
});

test('provider registry does not read real .env', async () => {
    const context = await createTempContext();
    const originalEnv = process.env;
    process.env = {
        AUTH_PROVIDER: 'local',
        DATABASE_PROVIDER: 'firebase',
        STORAGE_PROVIDER: 'firebase',
    };

    try {
        const registry = createProviderRegistry({ firebaseAuth: createFakeFirebaseAuth() });
        const container = createContainer(createMvpConfig(context.tempDir), registry);
        await container.imageRepository.close();

        assert.equal(typeof container.authProvider.getCurrentUser, 'function');
        assert.equal(typeof container.imageRepository.createImage, 'function');
        assert.equal(typeof container.storageProvider.saveObject, 'function');
    } finally {
        process.env = originalEnv;
        await context.cleanup();
    }
});

test('provider registry does not mutate passed dependencies', () => {
    const firebaseAuth = createFakeFirebaseAuth();
    const dependencies = { firebaseAuth };
    const beforeKeys = Object.keys(dependencies);
    const beforeFirebaseAuth = dependencies.firebaseAuth;

    createProviderRegistry(dependencies);

    assert.deepEqual(Object.keys(dependencies), beforeKeys);
    assert.equal(dependencies.firebaseAuth, beforeFirebaseAuth);
});
