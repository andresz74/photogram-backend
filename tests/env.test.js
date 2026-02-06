const test = require('node:test');
const assert = require('node:assert/strict');

const ENV_MODULE_PATH = '../config/env';

const loadEnvModule = () => {
    delete require.cache[require.resolve(ENV_MODULE_PATH)];
    return require(ENV_MODULE_PATH);
};

test('env config uses defaults when env vars are not set', () => {
    const original = { ...process.env };
    delete process.env.MAX_FILE_SIZE_MB;
    delete process.env.IMAGE_PROCESSOR;
    delete process.env.LOW_MEMORY_MODE;
    delete process.env.RESIZE_CONCURRENCY;

    const env = loadEnvModule();

    assert.equal(env.MAX_FILE_SIZE, 5 * 1024 * 1024);
    assert.equal(env.IMAGE_PROCESSOR, 'sharp');

    process.env = original;
});

test('env config applies MAX_FILE_SIZE_MB override', () => {
    const original = { ...process.env };
    process.env.LOW_MEMORY_MODE = 'false';
    process.env.MAX_FILE_SIZE_MB = '7';

    const env = loadEnvModule();

    assert.equal(env.MAX_FILE_SIZE, 7 * 1024 * 1024);

    process.env = original;
});

test('env config supports signed URL mode overrides', () => {
    const original = { ...process.env };
    process.env.FIREBASE_URL_MODE = 'signed';
    process.env.FIREBASE_SIGNED_URL_EXPIRES_SECONDS = '120';

    const env = loadEnvModule();

    assert.equal(env.FIREBASE_URL_MODE, 'signed');
    assert.equal(env.FIREBASE_SIGNED_URL_EXPIRES_SECONDS, 120);

    process.env = original;
});

test('env config clamps limits in low-memory mode', () => {
    const original = { ...process.env };
    process.env.LOW_MEMORY_MODE = 'true';
    process.env.MAX_FILE_SIZE_MB = '80';
    process.env.RESIZE_CONCURRENCY = '8';

    const env = loadEnvModule();

    assert.equal(env.LOW_MEMORY_MODE, true);
    assert.equal(env.MAX_FILE_SIZE_MB, 10);
    assert.equal(env.MAX_FILE_SIZE, 10 * 1024 * 1024);
    assert.equal(env.MAX_FILE_SIZE_WAS_CLAMPED, true);
    assert.equal(env.RESIZE_CONCURRENCY, 1);
    assert.equal(env.RESIZE_CONCURRENCY_WAS_CLAMPED, true);

    process.env = original;
});

test('env config allows higher caps when low-memory mode is disabled', () => {
    const original = { ...process.env };
    process.env.LOW_MEMORY_MODE = 'false';
    process.env.MAX_FILE_SIZE_MB = '20';
    process.env.RESIZE_CONCURRENCY = '3';

    const env = loadEnvModule();

    assert.equal(env.LOW_MEMORY_MODE, false);
    assert.equal(env.MAX_FILE_SIZE_MB, 20);
    assert.equal(env.MAX_FILE_SIZE_WAS_CLAMPED, false);
    assert.equal(env.RESIZE_CONCURRENCY, 3);
    assert.equal(env.RESIZE_CONCURRENCY_WAS_CLAMPED, false);

    process.env = original;
});
