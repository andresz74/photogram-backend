const requireObject = (value, name) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${name} must be an object.`);
    }
    return value;
};

const requireNonEmptyString = (value, name) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${name} is required.`);
    }
};

const assignIfPresent = (target, key, value) => {
    if (value !== null && value !== undefined) {
        target[key] = value;
    }
};

const createUrlOptions = (imageRecord, kind) => ({
    visibility: Boolean(imageRecord.isPublic) ? 'public' : 'private',
    kind,
});

function createImagePresenter({ storageProvider } = {}) {
    requireObject(storageProvider, 'storageProvider');
    if (typeof storageProvider.getUrl !== 'function') {
        throw new Error('storageProvider.getUrl must be a function.');
    }

    const toImageDto = async (imageRecord, options = {}) => {
        requireObject(imageRecord, 'imageRecord');
        requireNonEmptyString(imageRecord.id, 'imageRecord.id');
        requireNonEmptyString(imageRecord.storageKey, 'imageRecord.storageKey');
        requireNonEmptyString(imageRecord.createdAt, 'imageRecord.createdAt');

        const isPublic = Boolean(imageRecord.isPublic);
        const imageUrl = await storageProvider.getUrl(imageRecord.storageKey, createUrlOptions(imageRecord, 'image'));
        const dto = {
            id: imageRecord.id,
        };

        assignIfPresent(dto, 'ownerId', imageRecord.ownerId);
        assignIfPresent(dto, 'title', imageRecord.title);
        assignIfPresent(dto, 'description', imageRecord.description);
        dto.imageUrl = imageUrl;

        if (imageRecord.thumbnailKey) {
            dto.thumbnailUrl = await storageProvider.getUrl(
                imageRecord.thumbnailKey,
                createUrlOptions(imageRecord, 'thumbnail'),
            );
        }

        assignIfPresent(dto, 'width', imageRecord.width);
        assignIfPresent(dto, 'height', imageRecord.height);
        assignIfPresent(dto, 'sizeBytes', imageRecord.sizeBytes);
        assignIfPresent(dto, 'mimeType', imageRecord.mimeType);
        dto.isPublic = isPublic;
        dto.isArchived = Boolean(imageRecord.archivedAt);
        dto.createdAt = imageRecord.createdAt;
        assignIfPresent(dto, 'updatedAt', imageRecord.updatedAt);
        assignIfPresent(dto, 'archivedAt', imageRecord.archivedAt);

        return dto;
    };

    const toImageDtos = async (imageRecords, options = {}) => {
        if (!Array.isArray(imageRecords)) {
            throw new Error('imageRecords must be an array.');
        }

        const dtos = [];
        for (const imageRecord of imageRecords) {
            dtos.push(await toImageDto(imageRecord, options));
        }
        return dtos;
    };

    return {
        toImageDto,
        toImageDtos,
    };
}

module.exports = {
    createImagePresenter,
};
