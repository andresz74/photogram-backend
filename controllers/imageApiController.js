const VALIDATION_ERROR = 'VALIDATION_ERROR';

const createValidationError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = VALIDATION_ERROR;
    return error;
};

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

const parseIntegerQueryParam = (query, name, { allowZero }) => {
    if (!Object.prototype.hasOwnProperty.call(query, name)) {
        return undefined;
    }

    const value = query[name];
    if (Array.isArray(value) || typeof value === 'boolean') {
        throw createValidationError(`${name} must be an integer.`);
    }

    if (typeof value === 'number') {
        if (!Number.isInteger(value) || value < 0 || (!allowZero && value === 0)) {
            throw createValidationError(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer.`);
        }
        return value;
    }

    if (typeof value !== 'string' || value.trim() === '' || !/^\d+$/.test(value.trim())) {
        throw createValidationError(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer.`);
    }

    const parsedValue = Number(value.trim());
    if (!Number.isSafeInteger(parsedValue) || parsedValue < 0 || (!allowZero && parsedValue === 0)) {
        throw createValidationError(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer.`);
    }

    return parsedValue;
};

const parsePaginationOptions = (query = {}) => {
    const options = {};
    const limit = parseIntegerQueryParam(query, 'limit', { allowZero: false });
    const offset = parseIntegerQueryParam(query, 'offset', { allowZero: true });

    if (limit !== undefined) {
        options.limit = limit;
    }
    if (offset !== undefined) {
        options.offset = offset;
    }

    return options;
};

const parseBooleanQueryParam = (query, name) => {
    if (!Object.prototype.hasOwnProperty.call(query, name)) {
        return undefined;
    }

    const value = query[name];
    if (Array.isArray(value) || value === '') {
        throw createValidationError(`${name} must be true or false.`);
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }

    throw createValidationError(`${name} must be true or false.`);
};

const parseMyImagesOptions = (query = {}) => {
    const options = parsePaginationOptions(query);
    const archived = parseBooleanQueryParam(query, 'archived');
    const includeArchived = parseBooleanQueryParam(query, 'includeArchived');

    if (archived !== undefined) {
        options.archived = archived;
    }
    if (includeArchived !== undefined) {
        options.includeArchived = includeArchived;
    }

    return options;
};

const requireBooleanBodyField = (body, name) => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body[name] !== 'boolean') {
        throw createValidationError(`${name} must be a boolean.`);
    }

    return body[name];
};

const requireImageId = (imageId) => {
    if (typeof imageId !== 'string' || imageId.trim() === '') {
        throw createValidationError('imageId is required.');
    }
    return imageId;
};

function createImageApiController({
    imageService,
    imageUploadService,
    authProvider,
} = {}) {
    requireObject(imageService, 'imageService');
    requireObject(imageUploadService, 'imageUploadService');
    requireObject(authProvider, 'authProvider');

    requireFunction(imageService.listPublicImages, 'imageService.listPublicImages');
    requireFunction(imageService.listUserImages, 'imageService.listUserImages');
    requireFunction(imageService.updateImageVisibility, 'imageService.updateImageVisibility');
    requireFunction(imageService.archiveImage, 'imageService.archiveImage');
    requireFunction(imageService.unarchiveImage, 'imageService.unarchiveImage');
    requireFunction(imageService.deleteImage, 'imageService.deleteImage');
    requireFunction(imageUploadService.uploadImage, 'imageUploadService.uploadImage');
    requireFunction(authProvider.requireUser, 'authProvider.requireUser');

    const listPublicImages = async (req, res, next) => {
        try {
            const options = parsePaginationOptions(req.query || {});
            const images = await imageService.listPublicImages(options);
            res.status(200).json({ images });
        } catch (error) {
            next(error);
        }
    };

    const listMyImages = async (req, res, next) => {
        try {
            const options = parseMyImagesOptions(req.query || {});
            const currentUser = await authProvider.requireUser(req);
            const images = await imageService.listUserImages(currentUser, options);
            res.status(200).json({ images });
        } catch (error) {
            next(error);
        }
    };

    const updateImageVisibility = async (req, res, next) => {
        try {
            const imageId = requireImageId(req.params && req.params.imageId);
            const currentUser = await authProvider.requireUser(req);
            const isPublic = requireBooleanBodyField(req.body, 'isPublic');
            const image = await imageService.updateImageVisibility(imageId, currentUser, isPublic);

            if (!image) {
                res.status(404).json({ error: 'Image not found' });
                return;
            }

            res.status(200).json({ image });
        } catch (error) {
            next(error);
        }
    };

    const archiveImage = async (req, res, next) => {
        try {
            const imageId = requireImageId(req.params && req.params.imageId);
            const currentUser = await authProvider.requireUser(req);
            const image = await imageService.archiveImage(imageId, currentUser);

            if (!image) {
                res.status(404).json({ error: 'Image not found' });
                return;
            }

            res.status(200).json({ image });
        } catch (error) {
            next(error);
        }
    };

    const unarchiveImage = async (req, res, next) => {
        try {
            const imageId = requireImageId(req.params && req.params.imageId);
            const currentUser = await authProvider.requireUser(req);
            const image = await imageService.unarchiveImage(imageId, currentUser);

            if (!image) {
                res.status(404).json({ error: 'Image not found' });
                return;
            }

            res.status(200).json({ image });
        } catch (error) {
            next(error);
        }
    };

    const deleteImage = async (req, res, next) => {
        try {
            const imageId = requireImageId(req.params && req.params.imageId);
            const currentUser = await authProvider.requireUser(req);
            const result = await imageService.deleteImage(imageId, currentUser);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    const uploadImage = async (req, res, next) => {
        try {
            const currentUser = await authProvider.requireUser(req);
            const image = await imageUploadService.uploadImage({
                file: req.file,
                currentUser,
                fields: req.body || {},
            });
            res.status(201).json({ image });
        } catch (error) {
            next(error);
        }
    };

    return {
        listPublicImages,
        listMyImages,
        updateImageVisibility,
        archiveImage,
        unarchiveImage,
        deleteImage,
        uploadImage,
    };
}

module.exports = {
    createImageApiController,
};
