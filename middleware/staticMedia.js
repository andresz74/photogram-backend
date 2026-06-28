const path = require('path');

const CONTENT_TYPES = {
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
};

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const requireObject = (value, name) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${name} must be an object.`);
    }
};

const requireFunction = (value, name) => {
    if (typeof value !== 'function') {
        throw new Error(`${name} must be a function.`);
    }
};

const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
};

const getRawMediaPath = (req) => {
    const rawUrl = typeof req.path === 'string' ? req.path : req.url;
    const rawPath = String(rawUrl || '').split('?')[0];

    if (!rawPath || rawPath === '/') {
        throw new Error('Invalid media path');
    }

    return rawPath;
};

const decodePathSegment = (segment) => {
    try {
        return decodeURIComponent(segment);
    } catch (error) {
        throw new Error('Invalid media path');
    }
};

const getStorageKeyFromRequest = (req) => {
    const rawPath = getRawMediaPath(req);

    if (rawPath.startsWith('//') || rawPath.includes('\0')) {
        throw new Error('Invalid media path');
    }

    const rawSegments = rawPath.replace(/^\/+/, '').split('/');
    if (rawSegments.length === 0 || rawSegments.some((segment) => segment === '')) {
        throw new Error('Invalid media path');
    }

    const segments = rawSegments.map(decodePathSegment);
    if (segments.some((segment) =>
        segment === ''
        || segment === '..'
        || segment.includes('\\')
        || segment.includes('\0')
        || segment.includes('/')
    )) {
        throw new Error('Invalid media path');
    }

    const storageKey = segments.join('/');
    const extension = path.extname(storageKey).toLowerCase();
    const contentType = CONTENT_TYPES[extension];

    if (!contentType) {
        throw new Error('Invalid media path');
    }

    return {
        storageKey,
        contentType,
    };
};

function createStaticMediaMiddleware({ storageProvider } = {}) {
    requireObject(storageProvider, 'storageProvider');
    requireFunction(storageProvider.objectExists, 'storageProvider.objectExists');
    requireFunction(storageProvider.createReadStream, 'storageProvider.createReadStream');

    return async function staticMediaMiddleware(req, res, next) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            next();
            return;
        }

        let media;
        try {
            media = getStorageKeyFromRequest(req);
        } catch (error) {
            sendJson(res, 400, { error: 'Invalid media path' });
            return;
        }

        try {
            const exists = await storageProvider.objectExists(media.storageKey);
            if (!exists) {
                sendJson(res, 404, { error: 'Media not found' });
                return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', media.contentType);
            res.setHeader('Cache-Control', CACHE_CONTROL);

            if (req.method === 'HEAD') {
                res.end();
                return;
            }

            const readableStream = storageProvider.createReadStream(media.storageKey);
            readableStream.on('error', (error) => {
                if (!res.headersSent) {
                    next(error);
                    return;
                }

                res.destroy(error);
            });
            readableStream.pipe(res);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = {
    createStaticMediaMiddleware,
};
