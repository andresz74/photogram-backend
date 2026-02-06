const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PUBLIC_URL_MODE,
    SIGNED_URL_MODE,
    buildPublicUrl,
    resolveStorageUrl,
} = require('../utils/storageUrl');

test('buildPublicUrl returns storage.googleapis URL', () => {
    const url = buildPublicUrl('bucket-x', 'images/file.jpg');
    assert.equal(url, 'https://storage.googleapis.com/bucket-x/images/file.jpg');
});

test('resolveStorageUrl returns public URL when mode is public', async () => {
    const url = await resolveStorageUrl({
        file: {},
        bucketName: 'bucket-x',
        fileName: 'images/a.jpg',
        urlMode: PUBLIC_URL_MODE,
        signedUrlExpiresSeconds: 900,
    });

    assert.equal(url, 'https://storage.googleapis.com/bucket-x/images/a.jpg');
});

test('resolveStorageUrl returns signed URL when mode is signed', async () => {
    let called = false;

    const url = await resolveStorageUrl({
        file: {
            getSignedUrl: async (options) => {
                called = true;
                assert.equal(options.version, 'v4');
                assert.equal(options.action, 'read');
                assert.ok(Number.isFinite(options.expires));
                return ['https://signed.example.com/object'];
            },
        },
        bucketName: 'bucket-x',
        fileName: 'images/a.jpg',
        urlMode: SIGNED_URL_MODE,
        signedUrlExpiresSeconds: 900,
    });

    assert.equal(called, true);
    assert.equal(url, 'https://signed.example.com/object');
});
