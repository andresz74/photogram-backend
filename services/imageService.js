const VALIDATION_ERROR = 'VALIDATION_ERROR';
const UNAUTHENTICATED = 'UNAUTHENTICATED';
const FORBIDDEN = 'FORBIDDEN';

const createHttpError = (message, statusCode, code) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const createValidationError = (message) => createHttpError(message, 400, VALIDATION_ERROR);

const createUnauthenticatedError = (message) => createHttpError(message, 401, UNAUTHENTICATED);

const createForbiddenError = (message) => createHttpError(message, 403, FORBIDDEN);

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

const requireNonEmptyString = (value, name) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw createValidationError(`${name} is required.`);
    }
};

const requireBoolean = (value, name) => {
    if (typeof value !== 'boolean') {
        throw createValidationError(`${name} must be a boolean.`);
    }
};

const requireCurrentUser = (currentUser) => {
    if (!currentUser || typeof currentUser.uid !== 'string' || currentUser.uid.trim() === '') {
        throw createUnauthenticatedError('Authenticated currentUser.uid is required.');
    }
    return currentUser;
};

function createImageService({
    imageRepository,
    storageProvider,
    imagePresenter,
} = {}) {
    requireObject(imageRepository, 'imageRepository');
    requireObject(storageProvider, 'storageProvider');
    requireObject(imagePresenter, 'imagePresenter');

    requireFunction(imageRepository.listPublicImages, 'imageRepository.listPublicImages');
    requireFunction(imageRepository.listImagesByOwner, 'imageRepository.listImagesByOwner');
    requireFunction(imageRepository.findImageById, 'imageRepository.findImageById');
    requireFunction(imageRepository.createImage, 'imageRepository.createImage');
    requireFunction(imageRepository.updateImageVisibility, 'imageRepository.updateImageVisibility');
    requireFunction(imageRepository.archiveImageById, 'imageRepository.archiveImageById');
    requireFunction(imageRepository.unarchiveImageById, 'imageRepository.unarchiveImageById');
    requireFunction(imageRepository.deleteImageById, 'imageRepository.deleteImageById');
    requireFunction(storageProvider.deleteObject, 'storageProvider.deleteObject');
    requireFunction(imagePresenter.toImageDto, 'imagePresenter.toImageDto');
    requireFunction(imagePresenter.toImageDtos, 'imagePresenter.toImageDtos');

    const listPublicImages = async (options = {}) => {
        const imageRecords = await imageRepository.listPublicImages(options);
        return imagePresenter.toImageDtos(imageRecords);
    };

    const listUserImages = async (currentUser, options = {}) => {
        const user = requireCurrentUser(currentUser);
        const imageRecords = await imageRepository.listImagesByOwner(user.uid, options);
        return imagePresenter.toImageDtos(imageRecords);
    };

    const findImageById = async (imageId, options = {}) => {
        requireNonEmptyString(imageId, 'imageId');

        const imageRecord = await imageRepository.findImageById(imageId, options);
        if (!imageRecord) return null;

        return imagePresenter.toImageDto(imageRecord);
    };

    const createImage = async (imageData, currentUser) => {
        const user = requireCurrentUser(currentUser);
        if (!imageData || typeof imageData !== 'object' || Array.isArray(imageData)) {
            throw createValidationError('imageData is required.');
        }
        requireNonEmptyString(imageData.id, 'imageData.id');
        requireNonEmptyString(imageData.storageKey, 'imageData.storageKey');

        const repositoryImageData = {
            ...imageData,
            ownerId: user.uid,
        };
        const imageRecord = await imageRepository.createImage(repositoryImageData);
        return imagePresenter.toImageDto(imageRecord);
    };

    const updateImageVisibility = async (imageId, currentUser, isPublic) => {
        requireNonEmptyString(imageId, 'imageId');
        const user = requireCurrentUser(currentUser);
        requireBoolean(isPublic, 'isPublic');

        const imageRecord = await imageRepository.updateImageVisibility(imageId, user.uid, isPublic);
        if (!imageRecord) return null;

        return imagePresenter.toImageDto(imageRecord);
    };

    const archiveImage = async (imageId, currentUser) => {
        requireNonEmptyString(imageId, 'imageId');
        const user = requireCurrentUser(currentUser);

        const imageRecord = await imageRepository.archiveImageById(imageId, user.uid);
        if (!imageRecord) return null;

        return imagePresenter.toImageDto(imageRecord);
    };

    const unarchiveImage = async (imageId, currentUser) => {
        requireNonEmptyString(imageId, 'imageId');
        const user = requireCurrentUser(currentUser);

        const imageRecord = await imageRepository.unarchiveImageById(imageId, user.uid);
        if (!imageRecord) return null;

        return imagePresenter.toImageDto(imageRecord);
    };

    const deleteImage = async (imageId, currentUser) => {
        requireNonEmptyString(imageId, 'imageId');
        const user = requireCurrentUser(currentUser);

        const imageRecord = await imageRepository.findImageById(imageId);
        if (!imageRecord) {
            return {
                imageId,
                deleted: false,
            };
        }

        if (imageRecord.ownerId !== user.uid) {
            throw createForbiddenError('Current user does not own this image.');
        }

        requireNonEmptyString(imageRecord.storageKey, 'imageRecord.storageKey');

        await storageProvider.deleteObject(imageRecord.storageKey);
        if (imageRecord.thumbnailKey) {
            await storageProvider.deleteObject(imageRecord.thumbnailKey);
        }

        const repositoryResult = await imageRepository.deleteImageById(imageId, user.uid);
        return {
            imageId,
            deleted: Boolean(repositoryResult && repositoryResult.deleted),
        };
    };

    return {
        listPublicImages,
        listUserImages,
        findImageById,
        createImage,
        updateImageVisibility,
        archiveImage,
        unarchiveImage,
        deleteImage,
    };
}

module.exports = {
    createImageService,
};
