const rateLimit = require('express-rate-limit');

const createHandler = (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later.' });
};

const createRateLimiters = ({ defaultMax, heavyMax }) => {
    const defaultLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: defaultMax,
        standardHeaders: true,
        legacyHeaders: false,
        handler: createHandler,
    });

    const heavyLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: heavyMax,
        standardHeaders: true,
        legacyHeaders: false,
        handler: createHandler,
    });

    return { defaultLimiter, heavyLimiter };
};

module.exports = { createRateLimiters };
