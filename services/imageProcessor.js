const fs = require('fs');

const getSharp = () => require('sharp');
const getJimp = () => require('jimp');

const requireFilePath = (file) => {
    if (!file || typeof file.path !== 'string' || file.path.trim() === '') {
        throw new Error('file.path is required for image processing.');
    }
};

function createImageProcessor({ processorName } = {}) {
    const selectedProcessor = processorName || 'sharp';

    const processWithSharp = async (file, options) => {
        const sharp = getSharp();
        const { data, info } = await sharp(file.path)
            .rotate()
            .resize(options.maxWidth)
            .jpeg({ quality: options.quality })
            .toBuffer({ resolveWithObject: true });

        return {
            buffer: data,
            mimeType: 'image/jpeg',
            extension: 'jpg',
            width: info.width,
            height: info.height,
            sizeBytes: data.length,
        };
    };

    const processWithJimp = async (file, options) => {
        const Jimp = getJimp();
        const image = await Jimp.read(file.path);
        image.resize(options.maxWidth, Jimp.AUTO);
        image.quality(options.quality);
        const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

        return {
            buffer,
            mimeType: 'image/jpeg',
            extension: 'jpg',
            width: image.bitmap.width,
            height: image.bitmap.height,
            sizeBytes: buffer.length,
        };
    };

    const processImage = async (file, options = {}) => {
        requireFilePath(file);

        const processorOptions = {
            maxWidth: options.maxWidth || 1440,
            quality: options.quality || 80,
        };

        if (selectedProcessor === 'jimp') {
            return processWithJimp(file, processorOptions);
        }

        return processWithSharp(file, processorOptions);
    };

    return {
        processImage,
    };
}

const cleanTempFile = async (filePath) => {
    if (!filePath) return;
    await fs.promises.unlink(filePath).catch(() => {});
};

module.exports = {
    createImageProcessor,
    cleanTempFile,
};
