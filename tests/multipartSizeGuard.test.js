const test = require('node:test');
const assert = require('node:assert/strict');

const { createMultipartSizeGuard } = require('../middleware/multipartSizeGuard');

const createMockResponse = () => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body) => {
        res.body = body;
        return res;
    };
    return res;
};

test('multipartSizeGuard blocks requests above configured max size', () => {
    const guard = createMultipartSizeGuard(10);
    const req = { headers: { 'content-length': '11' } };
    const res = createMockResponse();
    let nextCalled = false;

    guard(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 413);
    assert.deepEqual(res.body, { error: 'Payload Too Large' });
});

test('multipartSizeGuard lets valid requests continue', () => {
    const guard = createMultipartSizeGuard(10);
    const req = { headers: { 'content-length': '10' } };
    const res = createMockResponse();
    let nextCalled = false;

    guard(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
});
