const rateLimit = require('express-rate-limit');

const createHandler = (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later.' });
};

const defaultLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createHandler,
});

const heavyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createHandler,
});

module.exports = { defaultLimiter, heavyLimiter };
