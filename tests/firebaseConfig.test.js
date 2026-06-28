const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const firebaseConfigPath = require.resolve('../config/firebase');
const envConfigPath = require.resolve('../config/env');
const firebaseAdminPath = require.resolve('firebase-admin');

const baseEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    AUTH_PROVIDER: 'firebase',
    DATABASE_PROVIDER: 'sqlite',
    STORAGE_PROVIDER: 'local',
    SQLITE_PATH: './data/photogram.sqlite',
    LOCAL_STORAGE_ROOT: './data/images',
    PUBLIC_MEDIA_BASE_URL: 'http://localhost:3000/media',
    FIREBASE_URL_MODE: 'signed',
    FIREBASE_SIGNED_URL_EXPIRES_SECONDS: '300',
    LOW_MEMORY_MODE: 'true',
    MAX_FILE_SIZE_MB: '5',
    RESIZE_CONCURRENCY: '1',
    HEAVY_RATE_LIMIT_MAX: '8',
    ENABLE_DEBUG_ENDPOINT: 'false',
    IMAGE_PROCESSOR: 'sharp',
};

const clearFirebaseConfigCache = () => {
    delete require.cache[firebaseConfigPath];
    delete require.cache[envConfigPath];
};

const createFakeAdmin = () => {
    const calls = [];
    const fakeAuth = {
        verifyIdToken: async () => ({ uid: 'user-1' }),
    };
    const fakeAdmin = {
        apps: [],
        credential: {
            cert(serviceAccount) {
                calls.push({ method: 'cert', serviceAccount });
                return { serviceAccount };
            },
        },
        initializeApp(options) {
            calls.push({ method: 'initializeApp', options });
            fakeAdmin.apps.push({ options });
            return fakeAdmin.apps[0];
        },
        storage() {
            calls.push({ method: 'storage' });
            return {
                bucket(bucketName) {
                    calls.push({ method: 'bucket', bucketName });
                    return {
                        name: bucketName,
                        file: () => ({}),
                    };
                },
            };
        },
        auth() {
            calls.push({ method: 'auth' });
            return fakeAuth;
        },
    };

    return {
        calls,
        fakeAdmin,
        fakeAuth,
    };
};

const loadFirebaseConfig = async ({ firebaseStorageBucket } = {}) => {
    const originalEnv = process.env;
    const originalAdminCache = require.cache[firebaseAdminPath];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photogram-firebase-config-'));
    const serviceAccountPath = path.join(tempDir, 'service-account.json');
    await fs.writeFile(serviceAccountPath, JSON.stringify({
        project_id: 'test-project',
        client_email: 'firebase-admin@example.test',
        private_key: 'fake-private-key',
    }));

    const { calls, fakeAdmin, fakeAuth } = createFakeAdmin();
    require.cache[firebaseAdminPath] = {
        id: firebaseAdminPath,
        filename: firebaseAdminPath,
        loaded: true,
        exports: fakeAdmin,
    };

    process.env = {
        ...originalEnv,
        ...baseEnv,
        FIREBASE_SERVICE_ACCOUNT_PATH: serviceAccountPath,
    };

    if (firebaseStorageBucket) {
        process.env.FIREBASE_STORAGE_BUCKET = firebaseStorageBucket;
    } else {
        delete process.env.FIREBASE_STORAGE_BUCKET;
    }

    clearFirebaseConfigCache();
    const firebaseConfig = require('../config/firebase');

    const cleanup = async () => {
        clearFirebaseConfigCache();
        if (originalAdminCache) {
            require.cache[firebaseAdminPath] = originalAdminCache;
        } else {
            delete require.cache[firebaseAdminPath];
        }
        process.env = originalEnv;
        await fs.rm(tempDir, { recursive: true, force: true });
    };

    return {
        calls,
        fakeAdmin,
        fakeAuth,
        firebaseConfig,
        cleanup,
    };
};

test('config/firebase.js can be imported without FIREBASE_STORAGE_BUCKET when storage provider is local', async () => {
    const context = await loadFirebaseConfig();
    try {
        assert.equal(typeof context.firebaseConfig.getAuth, 'function');
        assert.equal(typeof context.firebaseConfig.getBucket, 'function');
        assert.equal(context.calls.some((call) => call.method === 'bucket'), false);

        const initializeCall = context.calls.find((call) => call.method === 'initializeApp');
        assert.ok(initializeCall);
        assert.equal(Object.hasOwn(initializeCall.options, 'storageBucket'), false);
    } finally {
        await context.cleanup();
    }
});

test('getBucket throws a clear FIREBASE_STORAGE_BUCKET error when no bucket is configured', async () => {
    const context = await loadFirebaseConfig();
    try {
        assert.throws(
            () => context.firebaseConfig.getBucket(),
            /FIREBASE_STORAGE_BUCKET/,
        );
        assert.equal(context.calls.some((call) => call.method === 'bucket'), false);
    } finally {
        await context.cleanup();
    }
});

test('getBucket uses the configured FIREBASE_STORAGE_BUCKET', async () => {
    const context = await loadFirebaseConfig({
        firebaseStorageBucket: 'photogram-test.appspot.com',
    });
    try {
        assert.equal(context.calls.some((call) => call.method === 'bucket'), false);

        const initializeCall = context.calls.find((call) => call.method === 'initializeApp');
        assert.equal(initializeCall.options.storageBucket, 'photogram-test.appspot.com');

        const bucket = context.firebaseConfig.getBucket();
        assert.equal(bucket.name, 'photogram-test.appspot.com');
        assert.deepEqual(
            context.calls.filter((call) => call.method === 'bucket').map((call) => call.bucketName),
            ['photogram-test.appspot.com'],
        );
    } finally {
        await context.cleanup();
    }
});

test('Firebase Auth lazy getter still works without initializing Firebase Storage bucket', async () => {
    const context = await loadFirebaseConfig();
    try {
        const auth = context.firebaseConfig.getAuth();

        assert.equal(auth, context.fakeAuth);
        assert.equal(context.calls.some((call) => call.method === 'auth'), true);
        assert.equal(context.calls.some((call) => call.method === 'bucket'), false);
    } finally {
        await context.cleanup();
    }
});
