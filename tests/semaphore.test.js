const test = require('node:test');
const assert = require('node:assert/strict');

const { createSemaphore, withSemaphore } = require('../utils/semaphore');

test('createSemaphore enforces max concurrency', async () => {
    const semaphore = createSemaphore(1);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
        const release = await semaphore.acquire();
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 30));
        running -= 1;
        release();
    };

    await Promise.all([task(), task(), task()]);

    assert.equal(maxRunning, 1);
});

test('withSemaphore wraps async handler and always releases lock', async () => {
    const semaphore = createSemaphore(1);
    const events = [];

    const handler = withSemaphore(semaphore, async () => {
        events.push('start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push('end');
    });

    await Promise.all([handler({}, {}, () => {}), handler({}, {}, () => {})]);

    assert.deepEqual(events, ['start', 'end', 'start', 'end']);
});
