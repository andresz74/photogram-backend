const createMultipartSizeGuard = (maxFileSize) => (req, res, next) => {
    const contentLengthHeader = req.headers['content-length'];
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    if (Number.isFinite(contentLength) && contentLength > maxFileSize) {
        return res.status(413).json({ error: 'Payload Too Large' });
    }
    next();
};

module.exports = { createMultipartSizeGuard };
