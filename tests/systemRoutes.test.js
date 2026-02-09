const test = require('node:test');
const assert = require('node:assert/strict');

const { createSystemRouter } = require('../routes/systemRoutes');

const createNoopLimiter = (req, res, next) => next();

const getRoutePaths = (router) => router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

test('system router excludes /debug when debug endpoint is disabled', () => {
    const router = createSystemRouter({
        defaultLimiter: createNoopLimiter,
        enableDebugEndpoint: false,
    });

    const paths = getRoutePaths(router);

    assert.equal(paths.includes('/health'), true);
    assert.equal(paths.includes('/debug'), false);
});

test('system router includes /debug when debug endpoint is enabled', () => {
    const router = createSystemRouter({
        defaultLimiter: createNoopLimiter,
        enableDebugEndpoint: true,
    });

    const paths = getRoutePaths(router);

    assert.equal(paths.includes('/health'), true);
    assert.equal(paths.includes('/debug'), true);
});
