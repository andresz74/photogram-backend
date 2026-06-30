const multer = require('multer');

const { log, logError } = require('../utils/logger');

const multerErrorHandler = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        log('warn', 'Multer error on upload', { error: err.message });
        return res.status(400).json({ error: err.message });
    }
    return next(err);
};

const fallbackErrorHandler = (err, req, res, next) => {
    logError('Unhandled server error', err);
    if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500) {
        return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
};

module.exports = { multerErrorHandler, fallbackErrorHandler };
