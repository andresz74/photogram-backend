const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');

const { createImageController } = require('../controllers/imageController');

const createMockResponse = () => {
    const res = { statusCode: 200, sent: null, jsonPayload: null };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.send = (payload) => {
        res.sent = payload;
        return res;
    };
    res.json = (payload) => {
        res.jsonPayload = payload;
        return res;
    };
    return res;
};

const createController = (bucketOverride = null) => {
    const bucket = bucketOverride || { file: () => ({ delete: async () => {} }) };
    return createImageController({
        bucket,
        imageProcessor: 'sharp',
        uploadAcl: 'publicRead',
        usePredefinedAcl: true,
        urlMode: 'public',
        signedUrlExpiresSeconds: 900,
    });
};

const createControllerWithBucketGetter = (bucketGetter) => createImageController({
    bucketGetter,
    imageProcessor: 'sharp',
    uploadAcl: 'publicRead',
    usePredefinedAcl: true,
    urlMode: 'public',
    signedUrlExpiresSeconds: 900,
});

const createTempUploadFile = async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photogram-controller-upload-'));
    const filePath = path.join(tempDir, 'upload.jpg');
    await fs.writeFile(filePath, Buffer.from('fake image bytes'));

    return {
        filePath,
        cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
    };
};

const createUploadBucket = () => {
    const writes = [];

    return {
        name: 'test-bucket',
        writes,
        file(fileName) {
            return {
                createWriteStream() {
                    const chunks = [];
                    return new Writable({
                        write(chunk, encoding, callback) {
                            chunks.push(Buffer.from(chunk));
                            callback();
                        },
                        final(callback) {
                            writes.push({
                                fileName,
                                body: Buffer.concat(chunks).toString(),
                            });
                            callback();
                        },
                    });
                },
            };
        },
    };
};

const createUploadRequest = (filePath, body = {}) => ({
    body,
    file: {
        path: filePath,
        mimetype: 'image/jpeg',
        size: 16,
        originalname: 'photo.jpg',
    },
});

test('deleteImage returns 400 when imgName is missing', async () => {
    const controller = createController();
    const req = { body: {} };
    const res = createMockResponse();

    await controller.deleteImage(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.sent, 'Image name is required');
});

test('deleteImage does not request Firebase bucket when imgName is missing', async () => {
    let bucketRequested = false;
    const controller = createControllerWithBucketGetter(() => {
        bucketRequested = true;
        return { file: () => ({ delete: async () => {} }) };
    });
    const req = { body: {} };
    const res = createMockResponse();

    await controller.deleteImage(req, res);

    assert.equal(bucketRequested, false);
    assert.equal(res.statusCode, 400);
});

test('deleteImage deletes object and returns 200', async () => {
    let deletedPath = null;

    const controller = createController({
        file: (path) => ({
            delete: async () => {
                deletedPath = path;
            },
        }),
    });

    const req = { body: { imgName: 'abc.jpg' } };
    const res = createMockResponse();

    await controller.deleteImage(req, res);

    assert.equal(deletedPath, 'images/abc.jpg');
    assert.equal(res.statusCode, 200);
    assert.equal(res.sent, 'File successfully deleted');
});

test('deleteImage requests Firebase bucket lazily when storage is needed', async () => {
    let bucketRequests = 0;
    let deletedPath = null;
    const controller = createControllerWithBucketGetter(() => {
        bucketRequests += 1;
        return {
            file: (path) => ({
                delete: async () => {
                    deletedPath = path;
                },
            }),
        };
    });

    const req = { body: { imgName: 'lazy.jpg' } };
    const res = createMockResponse();

    await controller.deleteImage(req, res);

    assert.equal(bucketRequests, 1);
    assert.equal(deletedPath, 'images/lazy.jpg');
    assert.equal(res.statusCode, 200);
});

test('deleteImage returns 500 when storage delete fails', async () => {
    const controller = createController({
        file: () => ({
            delete: async () => {
                throw new Error('delete failed');
            },
        }),
    });

    const req = { body: { imgName: 'broken.jpg' } };
    const res = createMockResponse();

    await controller.deleteImage(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.sent, 'Failed to delete the image');
});

test('upload without tags still works and returns empty tag arrays', async () => {
    const temp = await createTempUploadFile();
    const bucket = createUploadBucket();
    const controller = createController(bucket);
    const req = createUploadRequest(temp.filePath);
    const res = createMockResponse();

    try {
        await controller.upload(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(typeof res.jsonPayload.url, 'string');
        assert.deepEqual(res.jsonPayload.tags, []);
        assert.deepEqual(res.jsonPayload.tagSlugs, []);
        assert.equal(bucket.writes.length, 1);
    } finally {
        await temp.cleanup();
    }
});

test('upload with valid tags returns tags and tagSlugs', async () => {
    const temp = await createTempUploadFile();
    const bucket = createUploadBucket();
    const controller = createController(bucket);
    const req = createUploadRequest(temp.filePath, {
        tags: JSON.stringify(['#Dog', 'golden retriever', 'New York']),
    });
    const res = createMockResponse();

    try {
        await controller.upload(req, res);

        assert.deepEqual(res.jsonPayload.tags, ['Dog', 'golden retriever', 'New York']);
        assert.deepEqual(res.jsonPayload.tagSlugs, ['dog', 'golden-retriever', 'new-york']);
    } finally {
        await temp.cleanup();
    }
});

test('upload malformed tags field returns 400', async () => {
    const temp = await createTempUploadFile();
    let bucketRequested = false;
    const controller = createControllerWithBucketGetter(() => {
        bucketRequested = true;
        return createUploadBucket();
    });
    const req = createUploadRequest(temp.filePath, { tags: 'dog,golden retriever' });
    const res = createMockResponse();

    try {
        await controller.upload(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.jsonPayload.error, /valid JSON/);
        assert.equal(bucketRequested, false);
    } finally {
        await temp.cleanup();
    }
});

test('resizeUpload malformed tags field returns 400', async () => {
    const temp = await createTempUploadFile();
    let bucketRequested = false;
    const controller = createControllerWithBucketGetter(() => {
        bucketRequested = true;
        return createUploadBucket();
    });
    const req = createUploadRequest(temp.filePath, { tags: 'dog,golden retriever' });
    const res = createMockResponse();

    try {
        await controller.resizeUpload(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.jsonPayload.error, /valid JSON/);
        assert.equal(bucketRequested, false);
    } finally {
        await temp.cleanup();
    }
});
