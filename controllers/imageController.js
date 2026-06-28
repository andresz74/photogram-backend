const fs = require('fs');
const { pipeline } = require('stream/promises');
const { v4: uuid } = require('uuid');

const { log, logError } = require('../utils/logger');
const { resolveStorageUrl } = require('../utils/storageUrl');

const getSharp = () => require('sharp');
const getJimp = () => require('jimp');

const cleanTempFile = async (filePath) => {
    if (!filePath) return;
    await fs.promises.unlink(filePath).catch(() => {});
};

const hasValidImageFile = (req, res, invalidMimetypeMessage = 'Uploaded file is not an image.') => {
    if (!req.file) {
        res.status(400).json({ error: 'No image file provided.' });
        return false;
    }
    if (!req.file.mimetype.startsWith('image/')) {
        res.status(400).json({ error: invalidMimetypeMessage });
        return false;
    }
    if (!req.file.size) {
        res.status(400).json({ error: 'Empty image file provided.' });
        return false;
    }
    return true;
};

const createImageController = ({
    bucket,
    bucketGetter,
    imageProcessor,
    uploadAcl,
    usePredefinedAcl,
    urlMode,
    signedUrlExpiresSeconds,
}) => {
    const getLegacyBucket = () => {
        if (bucketGetter) {
            return bucketGetter();
        }
        return bucket;
    };

    const resize = async (req, res) => {
        if (!hasValidImageFile(req, res)) return;

        try {
            res.set('Content-Type', 'image/jpeg');

            if (imageProcessor === 'jimp') {
                const Jimp = getJimp();
                const image = await Jimp.read(req.file.path);
                image.resize(1440, Jimp.AUTO);
                image.quality(80);
                const resizedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
                res.send(resizedBuffer);
            } else {
                const sharp = getSharp();
                await pipeline(
                    fs.createReadStream(req.file.path),
                    sharp().rotate().resize(1440).jpeg({ quality: 80 }),
                    res,
                );
            }
        } catch (error) {
            logError('Error resizing image', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to resize image', details: error.message });
            } else {
                res.destroy(error);
            }
        } finally {
            await cleanTempFile(req.file?.path);
        }
    };

    const upload = async (req, res) => {
        if (!hasValidImageFile(req, res)) return;

        try {
            const mime = req.file.mimetype || 'application/octet-stream';
            const mimeToExt = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp',
                'image/gif': 'gif',
                'image/avif': 'avif',
            };
            const ext = mimeToExt[mime] || 'bin';
            const fileName = `images/${uuid()}.${ext}`;
            const legacyBucket = getLegacyBucket();
            const file = legacyBucket.file(fileName);

            await pipeline(
                fs.createReadStream(req.file.path),
                file.createWriteStream({
                    resumable: false,
                    ...(usePredefinedAcl ? { predefinedAcl: uploadAcl } : {}),
                    metadata: {
                        contentType: mime,
                        cacheControl: 'public,max-age=31536000,immutable',
                    },
                }),
            );

            const url = await resolveStorageUrl({
                file,
                bucketName: legacyBucket.name,
                fileName,
                urlMode,
                signedUrlExpiresSeconds,
            });
            res.json({ url });
        } catch (error) {
            logError('Error uploading to Firebase Storage', error);
            res.status(500).json({ error: 'Failed to upload image to Firebase', details: error.message });
        } finally {
            await cleanTempFile(req.file?.path);
        }
    };

    const resizeUpload = async (req, res) => {
        const invalidMessage = `Uploaded file is not an image. Mimetype: ${req.file?.mimetype}`;
        if (!hasValidImageFile(req, res, invalidMessage)) return;

        log('info', 'Received file for resize-upload', { filename: req.file.originalname });

        try {
            const fileName = `images/${uuid()}.jpg`;
            log('info', 'Uploading resized image', { fileName });

            const legacyBucket = getLegacyBucket();
            const file = legacyBucket.file(fileName);

            if (imageProcessor === 'jimp') {
                const Jimp = getJimp();
                const image = await Jimp.read(req.file.path);
                image.resize(1440, Jimp.AUTO);
                image.quality(80);
                const compressedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

                await file.save(compressedBuffer, {
                    metadata: {
                        contentType: 'image/jpeg',
                        cacheControl: 'public,max-age=31536000,immutable',
                    },
                    ...(usePredefinedAcl ? { predefinedAcl: uploadAcl } : {}),
                });
            } else {
                const sharp = getSharp();
                await pipeline(
                    fs.createReadStream(req.file.path),
                    sharp().rotate().resize(1440).jpeg({ quality: 80 }),
                    file.createWriteStream({
                        resumable: false,
                        ...(usePredefinedAcl ? { predefinedAcl: uploadAcl } : {}),
                        metadata: {
                            contentType: 'image/jpeg',
                            cacheControl: 'public,max-age=31536000,immutable',
                        },
                    }),
                );
            }

            log('info', 'Image uploaded to Firebase Storage', { fileName });

            const url = await resolveStorageUrl({
                file,
                bucketName: legacyBucket.name,
                fileName,
                urlMode,
                signedUrlExpiresSeconds,
            });
            res.json({ url });
        } catch (error) {
            const message = String(error?.message || '');
            if (message.includes('Input file is missing') || message.includes('unsupported image format') || message.includes('corrupt')) {
                return res.status(400).json({ error: 'Invalid image file.' });
            }
            logError('Error uploading image', error);
            res.status(500).json({ error: 'Failed to upload image', details: error.message });
        } finally {
            await cleanTempFile(req.file?.path);
        }
    };

    const deleteImage = async (req, res) => {
        try {
            const { imgName } = req.body;

            if (!imgName) {
                return res.status(400).send('Image name is required');
            }

            const legacyBucket = getLegacyBucket();
            const file = legacyBucket.file(`images/${imgName}`);
            await file.delete();
            log('info', 'File deleted from Firebase Storage', { imgName });

            return res.status(200).send('File successfully deleted');
        } catch (error) {
            logError('Error deleting file from Firebase Storage', error);
            return res.status(500).send('Failed to delete the image');
        }
    };

    return {
        resize,
        upload,
        resizeUpload,
        deleteImage,
    };
};

module.exports = { createImageController };
