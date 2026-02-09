const createSemaphore = (maxConcurrent) => {
    const max = Math.max(1, Number(maxConcurrent) || 1);
    let current = 0;
    const waiting = [];

    const acquire = async () => {
        if (current < max) {
            current += 1;
            return () => {
                current -= 1;
                const next = waiting.shift();
                if (next) next();
            };
        }

        await new Promise((resolve) => waiting.push(resolve));
        current += 1;

        return () => {
            current -= 1;
            const next = waiting.shift();
            if (next) next();
        };
    };

    return { acquire };
};

const withSemaphore = (semaphore, handler) => async (req, res, next) => {
    const release = await semaphore.acquire();
    try {
        await handler(req, res, next);
    } finally {
        release();
    }
};

module.exports = { createSemaphore, withSemaphore };
