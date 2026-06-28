const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

const requireConfig = (config) => {
    if (!config || typeof config !== 'object') {
        throw new Error('config is required for SQLite image repository.');
    }
    if (!config.sqlitePath) {
        throw new Error('config.sqlitePath is required for SQLite image repository.');
    }
};

const requireNonEmptyString = (value, name) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${name} is required.`);
    }
};

const requireBoolean = (value, name) => {
    if (typeof value !== 'boolean') {
        throw new Error(`${name} must be a boolean.`);
    }
};

const normalizePagination = (options = {}) => {
    const limit = options.limit === undefined ? DEFAULT_LIMIT : Number(options.limit);
    const offset = options.offset === undefined ? 0 : Number(options.offset);

    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error('limit must be a positive integer.');
    }
    if (!Number.isInteger(offset) || offset < 0) {
        throw new Error('offset must be a non-negative integer.');
    }

    return {
        limit: Math.min(limit, MAX_LIMIT),
        offset,
    };
};

const toSqliteBoolean = (value) => (value === false ? 0 : 1);

const nowIso = () => new Date().toISOString();

const mapRowToImage = (row) => {
    if (!row) return null;

    return {
        id: row.id,
        ownerId: row.owner_id,
        title: row.title,
        description: row.description,
        storageKey: row.storage_key,
        thumbnailKey: row.thumbnail_key,
        mimeType: row.mime_type,
        width: row.width,
        height: row.height,
        sizeBytes: row.size_bytes,
        isPublic: Boolean(row.is_public),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        archivedAt: row.archived_at,
    };
};

const ensureColumn = (db, tableName, columnName, columnDefinition) => {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some((column) => column.name === columnName);

    if (!exists) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
    }
};

const initializeSchema = (db) => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            title TEXT,
            description TEXT,
            storage_key TEXT NOT NULL,
            thumbnail_key TEXT,
            mime_type TEXT,
            width INTEGER,
            height INTEGER,
            size_bytes INTEGER,
            is_public INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            deleted_at TEXT,
            archived_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_images_public_created
        ON images (is_public, created_at);

        CREATE INDEX IF NOT EXISTS idx_images_owner_created
        ON images (owner_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_images_deleted
        ON images (deleted_at);
    `);

    ensureColumn(db, 'images', 'archived_at', 'archived_at TEXT');

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_images_archived
        ON images (archived_at);
    `);
};

const createSqliteImageRepository = ({ config } = {}) => {
    requireConfig(config);

    const sqlitePath = path.resolve(config.sqlitePath);
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

    const db = new Database(sqlitePath);
    initializeSchema(db);

    const insertImage = db.prepare(`
        INSERT INTO images (
            id,
            owner_id,
            title,
            description,
            storage_key,
            thumbnail_key,
            mime_type,
            width,
            height,
            size_bytes,
            is_public,
            created_at,
            updated_at,
            deleted_at,
            archived_at
        ) VALUES (
            @id,
            @ownerId,
            @title,
            @description,
            @storageKey,
            @thumbnailKey,
            @mimeType,
            @width,
            @height,
            @sizeBytes,
            @isPublic,
            @createdAt,
            @updatedAt,
            NULL,
            NULL
        )
    `);
    const findByIdActive = db.prepare('SELECT * FROM images WHERE id = ? AND deleted_at IS NULL');
    const findByIdAny = db.prepare('SELECT * FROM images WHERE id = ?');
    const listPublic = db.prepare(`
        SELECT * FROM images
        WHERE is_public = 1
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
    `);
    const listByOwnerActive = db.prepare(`
        SELECT * FROM images
        WHERE owner_id = @ownerId
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
    `);
    const listByOwnerArchived = db.prepare(`
        SELECT * FROM images
        WHERE owner_id = @ownerId
            AND deleted_at IS NULL
            AND archived_at IS NOT NULL
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
    `);
    const listByOwnerAll = db.prepare(`
        SELECT * FROM images
        WHERE owner_id = @ownerId
            AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
    `);
    const softDelete = db.prepare(`
        UPDATE images
        SET deleted_at = @timestamp,
            updated_at = @timestamp
        WHERE id = @imageId
            AND owner_id = @ownerId
            AND deleted_at IS NULL
    `);
    const updateVisibility = db.prepare(`
        UPDATE images
        SET is_public = @isPublic,
            updated_at = @timestamp
        WHERE id = @imageId
            AND owner_id = @ownerId
            AND deleted_at IS NULL
    `);
    const archiveImage = db.prepare(`
        UPDATE images
        SET archived_at = COALESCE(archived_at, @timestamp),
            updated_at = @timestamp
        WHERE id = @imageId
            AND owner_id = @ownerId
            AND deleted_at IS NULL
    `);
    const unarchiveImage = db.prepare(`
        UPDATE images
        SET archived_at = NULL,
            updated_at = @timestamp
        WHERE id = @imageId
            AND owner_id = @ownerId
            AND deleted_at IS NULL
    `);

    const createImage = async (imageData = {}) => {
        requireNonEmptyString(imageData.id, 'id');
        requireNonEmptyString(imageData.ownerId, 'ownerId');
        requireNonEmptyString(imageData.storageKey, 'storageKey');

        const createdAt = imageData.createdAt || nowIso();
        const updatedAt = imageData.updatedAt || createdAt;
        const params = {
            id: imageData.id,
            ownerId: imageData.ownerId,
            title: imageData.title ?? null,
            description: imageData.description ?? null,
            storageKey: imageData.storageKey,
            thumbnailKey: imageData.thumbnailKey ?? null,
            mimeType: imageData.mimeType ?? null,
            width: imageData.width ?? null,
            height: imageData.height ?? null,
            sizeBytes: imageData.sizeBytes ?? null,
            isPublic: toSqliteBoolean(imageData.isPublic),
            createdAt,
            updatedAt,
        };

        try {
            insertImage.run(params);
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new Error(`Image id already exists: ${imageData.id}`);
            }
            throw error;
        }

        return mapRowToImage(findByIdAny.get(imageData.id));
    };

    const findImageById = async (imageId, options = {}) => {
        requireNonEmptyString(imageId, 'imageId');
        const row = options.includeDeleted === true
            ? findByIdAny.get(imageId)
            : findByIdActive.get(imageId);

        return mapRowToImage(row);
    };

    const listPublicImages = async (options = {}) => {
        const pagination = normalizePagination(options);
        return listPublic.all(pagination).map(mapRowToImage);
    };

    const listImagesByOwner = async (ownerId, options = {}) => {
        requireNonEmptyString(ownerId, 'ownerId');
        const pagination = normalizePagination(options);
        const statement = options.archived === true
            ? listByOwnerArchived
            : options.includeArchived === true
                ? listByOwnerAll
                : listByOwnerActive;

        return statement.all({ ownerId, ...pagination }).map(mapRowToImage);
    };

    const updateImageVisibility = async (imageId, ownerId, isPublic) => {
        requireNonEmptyString(imageId, 'imageId');
        requireNonEmptyString(ownerId, 'ownerId');
        requireBoolean(isPublic, 'isPublic');

        const result = updateVisibility.run({
            imageId,
            ownerId,
            isPublic: toSqliteBoolean(isPublic),
            timestamp: nowIso(),
        });

        if (result.changes !== 1) return null;
        return mapRowToImage(findByIdActive.get(imageId));
    };

    const archiveImageById = async (imageId, ownerId) => {
        requireNonEmptyString(imageId, 'imageId');
        requireNonEmptyString(ownerId, 'ownerId');

        const result = archiveImage.run({
            imageId,
            ownerId,
            timestamp: nowIso(),
        });

        if (result.changes !== 1) return null;
        return mapRowToImage(findByIdActive.get(imageId));
    };

    const unarchiveImageById = async (imageId, ownerId) => {
        requireNonEmptyString(imageId, 'imageId');
        requireNonEmptyString(ownerId, 'ownerId');

        const result = unarchiveImage.run({
            imageId,
            ownerId,
            timestamp: nowIso(),
        });

        if (result.changes !== 1) return null;
        return mapRowToImage(findByIdActive.get(imageId));
    };

    const deleteImageById = async (imageId, ownerId) => {
        requireNonEmptyString(imageId, 'imageId');
        requireNonEmptyString(ownerId, 'ownerId');

        const result = softDelete.run({
            imageId,
            ownerId,
            timestamp: nowIso(),
        });

        return {
            imageId,
            deleted: result.changes === 1,
        };
    };

    const close = async () => {
        db.close();
    };

    return {
        listPublicImages,
        listImagesByOwner,
        findImageById,
        createImage,
        updateImageVisibility,
        archiveImageById,
        unarchiveImageById,
        deleteImageById,
        close,
    };
};

module.exports = {
    createSqliteImageRepository,
};
