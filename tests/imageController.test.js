const test = require('node:test');
const assert = require('node:assert/strict');

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

test('deleteImage returns 400 when imgName is missing', async () => {
    const controller = createController();
    const req = { body: {} };
    const res = createMockResponse();

    await controller.deleteImage(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.sent, 'Image name is required');
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
