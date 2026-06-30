const { v4: uuid } = require('uuid');

const { cleanTempFile } = require('./imageProcessor');
const { normalizeTags } = require('../utils/tags');

const VALIDATION_ERROR = 'VALIDATION_ERROR';
const UNAUTHENTICATED = 'UNAUTHENTICATED';

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

const createHttpError = (message, statusCode, code) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const createValidationError = (message) => createHttpError(message, 400, VALIDATION_ERROR);

const createUnauthenticatedError = (message) => createHttpError(message, 401, UNAUTHENTICATED);

const requireObject = (value, name) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${name} must be an object.`);
    }
    return value;
};

const requireFunction = (value, name) => {
    if (typeof value !== 'function') {
        throw new Error(`${name} must be a function.`);
    }
};

const requireCurrentUser = (currentUser) => {
    if (!currentUser || typeof currentUser.uid !== 'string' || currentUser.uid.trim() === '') {
        throw createUnauthenticatedError('Authenticated currentUser.uid is required.');
    }
    return currentUser;
};

const requireImageFile = (file, config) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
        throw createValidationError('file is required.');
    }
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        throw createValidationError('file must be an image.');
    }
    if (!file.size || file.size <= 0) {
        throw createValidationError('file must not be empty.');
    }
    if (config.maxFileSizeBytes && file.size > config.maxFileSizeBytes) {
        throw createValidationError('file exceeds maxFileSizeBytes.');
    }
};

const normalizePathSegment = (value, name) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw createValidationError(`${name} is required.`);
    }
    if (
        value.includes('/')
        || value.includes('\\')
        || value.includes('\0')
        || value === '.'
        || value === '..'
    ) {
        throw createValidationError(`${name} contains invalid path characters.`);
    }
    return value;
};

const normalizeExtension = (extension) => {
    if (typeof extension !== 'string' || extension.trim() === '') {
        throw createValidationError('processed image extension is required.');
    }

    const normalizedExtension = extension.trim().toLowerCase().replace(/^\./, '');
    if (!ALLOWED_EXTENSIONS.has(normalizedExtension)) {
        throw createValidationError(`Unsupported processed image extension: ${extension}`);
    }

    return normalizedExtension;
};

const createProcessedKey = (prefix, key) => {
    if (!prefix) return key;
    return `${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
};

const hasOutput = (processed, prefix = '') => {
    const bufferKey = createProcessedKey(prefix, 'buffer');
    const readableStreamKey = createProcessedKey(prefix, 'readableStream');
    return Boolean(processed[bufferKey] || processed[readableStreamKey]);
};

const createStorageInput = ({ storageKey, processed, prefix = '' }) => {
    const bufferKey = createProcessedKey(prefix, 'buffer');
    const readableStreamKey = createProcessedKey(prefix, 'readableStream');

    return {
        storageKey,
        buffer: processed[bufferKey],
        readableStream: processed[readableStreamKey],
    };
};

const getSizeBytes = (processed, saveResult, prefix = '') => {
    const sizeKey = createProcessedKey(prefix, 'sizeBytes');
    const bufferKey = createProcessedKey(prefix, 'buffer');

    if (Number.isInteger(processed[sizeKey]) && processed[sizeKey] >= 0) {
        return processed[sizeKey];
    }
    if (Buffer.isBuffer(processed[bufferKey])) {
        return processed[bufferKey].length;
    }
    if (saveResult && Number.isInteger(saveResult.sizeBytes)) {
        return saveResult.sizeBytes;
    }
    return null;
};

const parseOptionalString = (fields, name) => {
    const value = fields[name];
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) {
        throw createValidationError(`${name} must be a string.`);
    }
    return String(value);
};

const parseIsPublic = (fields) => {
    const value = fields.isPublic;
    if (value === undefined || value === null || value === '') return true;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw createValidationError('isPublic must be true or false.');
};

const createCleanupRecorder = (storageProvider) => async (storageKeys, originalError) => {
    if (typeof storageProvider.deleteObject !== 'function') {
        return;
    }

    const cleanupFailures = [];
    for (const storageKey of storageKeys.filter(Boolean)) {
        try {
            await storageProvider.deleteObject(storageKey);
        } catch (cleanupError) {
            cleanupFailures.push(cleanupError);
        }
    }

    if (cleanupFailures.length > 0) {
        originalError.cleanupFailed = true;
        originalError.cleanupErrorCount = cleanupFailures.length;
    }
};

function createImageUploadService({
    config,
    storageProvider,
    imageService,
    imageProcessor,
    idGenerator,
} = {}) {
    requireObject(config, 'config');
    requireObject(storageProvider, 'storageProvider');
    requireObject(imageService, 'imageService');

    requireFunction(storageProvider.saveObject, 'storageProvider.saveObject');
    requireFunction(imageService.createImage, 'imageService.createImage');

    const processImage = typeof imageProcessor === 'function'
        ? imageProcessor
        : imageProcessor && imageProcessor.processImage;
    requireFunction(processImage, 'imageProcessor.processImage');

    const generateId = idGenerator || uuid;
    requireFunction(generateId, 'idGenerator');

    const cleanupSavedObjects = createCleanupRecorder(storageProvider);

    const uploadImage = async ({ file, currentUser, fields = {} } = {}) => {
        const user = requireCurrentUser(currentUser);
        requireImageFile(file, config);

        try {
            const uid = normalizePathSegment(user.uid, 'currentUser.uid');
            const imageId = normalizePathSegment(String(generateId()), 'imageId');
            const uploadFields = fields || {};
            const title = parseOptionalString(uploadFields, 'title');
            const description = parseOptionalString(uploadFields, 'description');
            const isPublic = parseIsPublic(uploadFields);
            const { tags, tagSlugs } = normalizeTags(uploadFields.tags);
            const savedStorageKeys = [];

            const processed = await processImage(file, {
                config,
                maxWidth: 1440,
                quality: 80,
                imageProcessor: config.imageProcessor,
                maxFileSizeBytes: config.maxFileSizeBytes,
                lowMemoryMode: config.lowMemoryMode,
            });

            requireObject(processed, 'processed image');
            if (!hasOutput(processed)) {
                throw createValidationError('processed image output is required.');
            }

            const extension = normalizeExtension(processed.extension || 'jpg');
            const storageKey = `users/${uid}/images/${imageId}.${extension}`;
            const thumbnailExtension = processed.thumbnailExtension
                ? normalizeExtension(processed.thumbnailExtension)
                : extension;
            const thumbnailKey = hasOutput(processed, 'thumbnail')
                ? `users/${uid}/thumbnails/${imageId}.${thumbnailExtension}`
                : null;

            const mainSaveResult = await storageProvider.saveObject(createStorageInput({
                storageKey,
                processed,
            }));
            savedStorageKeys.push(storageKey);

            if (thumbnailKey) {
                try {
                    await storageProvider.saveObject(createStorageInput({
                        storageKey: thumbnailKey,
                        processed,
                        prefix: 'thumbnail',
                    }));
                    savedStorageKeys.push(thumbnailKey);
                } catch (error) {
                    await cleanupSavedObjects([storageKey], error);
                    throw error;
                }
            }

            const imageData = {
                id: imageId,
                title,
                description,
                storageKey,
                thumbnailKey,
                mimeType: processed.mimeType || 'image/jpeg',
                width: processed.width ?? null,
                height: processed.height ?? null,
                sizeBytes: getSizeBytes(processed, mainSaveResult),
                isPublic,
                tags,
                tagSlugs,
            };

            try {
                return await imageService.createImage(imageData, user);
            } catch (error) {
                await cleanupSavedObjects(savedStorageKeys, error);
                throw error;
            }
        } finally {
            await cleanTempFile(file.path);
        }
    };

    return {
        uploadImage,
    };
}

module.exports = {
    createImageUploadService,
};
