const test = require('node:test');
const assert = require('node:assert/strict');

const originalEnv = process.env;
process.env = {
    ...originalEnv,
    FIREBASE_SERVICE_ACCOUNT_PATH: '/tmp/firebase-service-account.json',
};

const { readEnv } = require('../config/env');

process.env = originalEnv;

const baseEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    AUTH_PROVIDER: 'firebase',
    DATABASE_PROVIDER: 'sqlite',
    STORAGE_PROVIDER: 'local',
    SQLITE_PATH: './data/photogram.sqlite',
    LOCAL_STORAGE_ROOT: './data/images',
    PUBLIC_MEDIA_BASE_URL: 'http://localhost:3000/media',
    FIREBASE_SERVICE_ACCOUNT_PATH: '/secure/photogram/firebase-service-account.json',
    FIREBASE_URL_MODE: 'signed',
    FIREBASE_SIGNED_URL_EXPIRES_SECONDS: '300',
    LOW_MEMORY_MODE: 'true',
    MAX_FILE_SIZE_MB: '5',
    RESIZE_CONCURRENCY: '1',
    HEAVY_RATE_LIMIT_MAX: '8',
    ENABLE_DEBUG_ENDPOINT: 'false',
    IMAGE_PROCESSOR: 'sharp',
};

const withEnv = (overrides) => ({ ...baseEnv, ...overrides });

const assertEnvError = (env, envName) => {
    assert.throws(
        () => readEnv(env),
        (error) => error instanceof Error && error.message.includes(envName),
    );
};

test('parses the local MVP provider configuration', () => {
    const config = readEnv(baseEnv);

    assert.equal(config.authProvider, 'firebase');
    assert.equal(config.databaseProvider, 'sqlite');
    assert.equal(config.storageProvider, 'local');
    assert.equal(config.sqlitePath, './data/photogram.sqlite');
    assert.equal(config.localStorageRoot, './data/images');
    assert.equal(config.publicMediaBaseUrl, 'http://localhost:3000/media');
});

test('rejects invalid AUTH_PROVIDER', () => {
    assertEnvError(withEnv({ AUTH_PROVIDER: 'oauth' }), 'AUTH_PROVIDER');
});

test('rejects invalid DATABASE_PROVIDER', () => {
    assertEnvError(withEnv({ DATABASE_PROVIDER: 'postgres' }), 'DATABASE_PROVIDER');
});

test('rejects invalid STORAGE_PROVIDER', () => {
    assertEnvError(withEnv({ STORAGE_PROVIDER: 's3' }), 'STORAGE_PROVIDER');
});

test('rejects invalid IMAGE_PROCESSOR', () => {
    assertEnvError(withEnv({ IMAGE_PROCESSOR: 'imagemagick' }), 'IMAGE_PROCESSOR');
});

test('rejects invalid FIREBASE_URL_MODE', () => {
    assertEnvError(withEnv({ FIREBASE_URL_MODE: 'private' }), 'FIREBASE_URL_MODE');
});

test('parses boolean values', () => {
    const config = readEnv(withEnv({
        LOW_MEMORY_MODE: 'false',
        ENABLE_DEBUG_ENDPOINT: 'true',
    }));

    assert.equal(config.lowMemoryMode, false);
    assert.equal(config.enableDebugEndpoint, true);
});

test('rejects invalid boolean values', () => {
    assertEnvError(withEnv({ LOW_MEMORY_MODE: 'yes' }), 'LOW_MEMORY_MODE');
    assertEnvError(withEnv({ ENABLE_DEBUG_ENDPOINT: 'auto' }), 'ENABLE_DEBUG_ENDPOINT');
});

test('parses numeric values', () => {
    const config = readEnv(withEnv({
        PORT: '3003',
        FIREBASE_SIGNED_URL_EXPIRES_SECONDS: '120',
        MAX_FILE_SIZE_MB: '7',
        RESIZE_CONCURRENCY: '3',
        HEAVY_RATE_LIMIT_MAX: '11',
        LOW_MEMORY_MODE: 'false',
    }));

    assert.equal(config.port, 3003);
    assert.equal(config.firebaseSignedUrlExpiresSeconds, 120);
    assert.equal(config.maxFileSizeMb, 7);
    assert.equal(config.resizeConcurrency, 3);
    assert.equal(config.heavyRateLimitMax, 11);
});

test('rejects invalid numeric values', () => {
    assertEnvError(withEnv({ PORT: '0' }), 'PORT');
    assertEnvError(withEnv({ FIREBASE_SIGNED_URL_EXPIRES_SECONDS: '-1' }), 'FIREBASE_SIGNED_URL_EXPIRES_SECONDS');
    assertEnvError(withEnv({ MAX_FILE_SIZE_MB: '1.5' }), 'MAX_FILE_SIZE_MB');
    assertEnvError(withEnv({ RESIZE_CONCURRENCY: 'many' }), 'RESIZE_CONCURRENCY');
    assertEnvError(withEnv({ HEAVY_RATE_LIMIT_MAX: '0' }), 'HEAVY_RATE_LIMIT_MAX');
});

test('sqlite mode includes sqlitePath', () => {
    const config = readEnv(withEnv({
        DATABASE_PROVIDER: 'sqlite',
        SQLITE_PATH: './custom/photogram.sqlite',
    }));

    assert.equal(config.sqlitePath, './custom/photogram.sqlite');
});

test('local storage mode includes localStorageRoot', () => {
    const config = readEnv(withEnv({
        STORAGE_PROVIDER: 'local',
        LOCAL_STORAGE_ROOT: './custom/images',
    }));

    assert.equal(config.localStorageRoot, './custom/images');
});

test('local storage mode includes publicMediaBaseUrl', () => {
    const config = readEnv(withEnv({
        STORAGE_PROVIDER: 'local',
        PUBLIC_MEDIA_BASE_URL: 'http://localhost:3000/custom-media',
    }));

    assert.equal(config.publicMediaBaseUrl, 'http://localhost:3000/custom-media');
});

test('Firebase auth mode requires FIREBASE_SERVICE_ACCOUNT_PATH', () => {
    const env = withEnv({ AUTH_PROVIDER: 'firebase' });
    delete env.FIREBASE_SERVICE_ACCOUNT_PATH;

    assertEnvError(env, 'FIREBASE_SERVICE_ACCOUNT_PATH');
});

test('Firebase storage mode requires FIREBASE_STORAGE_BUCKET', () => {
    const env = withEnv({
        STORAGE_PROVIDER: 'firebase',
        FIREBASE_STORAGE_BUCKET: '',
    });

    assertEnvError(env, 'FIREBASE_STORAGE_BUCKET');
});

test('returned config uses camelCase property names', () => {
    const config = readEnv(baseEnv);

    assert.equal(Object.prototype.hasOwnProperty.call(config, 'nodeEnv'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'authProvider'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'firebaseServiceAccountPath'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'AUTH_PROVIDER'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'FIREBASE_SERVICE_ACCOUNT_PATH'), false);
});

test('error messages include the relevant env var name', () => {
    assertEnvError(withEnv({ FIREBASE_URL_MODE: 'temporary' }), 'FIREBASE_URL_MODE');
});
