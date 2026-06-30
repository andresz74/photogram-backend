const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { createSqliteImageRepository } = require('../repositories/sqliteImageRepository');

const createTempContext = async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photogram-sqlite-repo-'));
    return {
        tempDir,
        sqlitePath: path.join(tempDir, 'nested', 'photogram.sqlite'),
        cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
    };
};

const createRepositoryContext = async () => {
    const context = await createTempContext();
    const repository = createSqliteImageRepository({
        config: {
            sqlitePath: context.sqlitePath,
        },
    });

    return {
        ...context,
        repository,
        cleanup: async () => {
            await repository.close().catch(() => {});
            await context.cleanup();
        },
    };
};

const createImageData = (overrides = {}) => ({
    id: 'img-1',
    ownerId: 'owner-1',
    storageKey: 'users/owner-1/images/img-1.webp',
    ...overrides,
});

const createImage = (repository, overrides = {}) =>
    repository.createImage(createImageData(overrides));

test('creates a SQLite image repository', async () => {
    const context = await createRepositoryContext();
    try {
        assert.equal(typeof context.repository.listPublicImages, 'function');
        assert.equal(typeof context.repository.listImagesByOwner, 'function');
        assert.equal(typeof context.repository.findImageById, 'function');
        assert.equal(typeof context.repository.createImage, 'function');
        assert.equal(typeof context.repository.updateImageVisibility, 'function');
        assert.equal(typeof context.repository.archiveImageById, 'function');
        assert.equal(typeof context.repository.unarchiveImageById, 'function');
        assert.equal(typeof context.repository.deleteImageById, 'function');
        assert.equal(typeof context.repository.close, 'function');
    } finally {
        await context.cleanup();
    }
});

test('rejects missing config', () => {
    assert.throws(
        () => createSqliteImageRepository(),
        /config/,
    );
});

test('rejects missing config.sqlitePath', () => {
    assert.throws(
        () => createSqliteImageRepository({ config: {} }),
        /config\.sqlitePath/,
    );
});

test('creates the database parent directory', async () => {
    const context = await createRepositoryContext();
    try {
        const stats = await fs.stat(path.dirname(context.sqlitePath));
        assert.equal(stats.isDirectory(), true);
    } finally {
        await context.cleanup();
    }
});

test('initializes the images table', async () => {
    const context = await createRepositoryContext();
    try {
        const created = await createImage(context.repository);
        assert.equal(created.id, 'img-1');
    } finally {
        await context.cleanup();
    }
});

test('schema includes archived_at', async () => {
    const context = await createRepositoryContext();
    try {
        await context.repository.close();
        const db = new Database(context.sqlitePath);
        try {
            const columns = db.prepare('PRAGMA table_info(images)').all();
            assert.equal(columns.some((column) => column.name === 'archived_at'), true);
            assert.equal(columns.some((column) => column.name === 'tags'), true);
            assert.equal(columns.some((column) => column.name === 'tag_slugs'), true);
        } finally {
            db.close();
        }
    } finally {
        await context.cleanup();
    }
});

test('migrates existing images table with archived_at', async () => {
    const context = await createTempContext();
    await fs.mkdir(path.dirname(context.sqlitePath), { recursive: true });
    const db = new Database(context.sqlitePath);
    db.exec(`
        CREATE TABLE images (
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
            deleted_at TEXT
        );
    `);
    db.close();

    const repository = createSqliteImageRepository({
        config: {
            sqlitePath: context.sqlitePath,
        },
    });

    try {
        await repository.close();
        const migratedDb = new Database(context.sqlitePath);
        try {
            const columns = migratedDb.prepare('PRAGMA table_info(images)').all();
            assert.equal(columns.some((column) => column.name === 'archived_at'), true);
            assert.equal(columns.some((column) => column.name === 'tags'), true);
            assert.equal(columns.some((column) => column.name === 'tag_slugs'), true);
        } finally {
            migratedDb.close();
        }
    } finally {
        await context.cleanup();
    }
});

test('migrates existing rows without tags and returns empty tag arrays', async () => {
    const context = await createTempContext();
    await fs.mkdir(path.dirname(context.sqlitePath), { recursive: true });
    const db = new Database(context.sqlitePath);
    db.exec(`
        CREATE TABLE images (
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
            deleted_at TEXT
        );

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
            deleted_at
        ) VALUES (
            'legacy-1',
            'owner-1',
            NULL,
            NULL,
            'users/owner-1/images/legacy-1.webp',
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            1,
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z',
            NULL
        );
    `);
    db.close();

    const repository = createSqliteImageRepository({
        config: {
            sqlitePath: context.sqlitePath,
        },
    });

    try {
        const image = await repository.findImageById('legacy-1');

        assert.deepEqual(image.tags, []);
        assert.deepEqual(image.tagSlugs, []);
        assert.equal(image.archivedAt, null);
    } finally {
        await repository.close();
        await context.cleanup();
    }
});

test('creates an image with required fields', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository);

        assert.equal(image.id, 'img-1');
        assert.equal(image.ownerId, 'owner-1');
        assert.equal(image.storageKey, 'users/owner-1/images/img-1.webp');
    } finally {
        await context.cleanup();
    }
});

test('defaults optional fields', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository);

        assert.equal(image.title, null);
        assert.equal(image.description, null);
        assert.equal(image.thumbnailKey, null);
        assert.equal(image.mimeType, null);
        assert.equal(image.width, null);
        assert.equal(image.height, null);
        assert.equal(image.sizeBytes, null);
    } finally {
        await context.cleanup();
    }
});

test('defaults isPublic to true', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository);
        assert.equal(image.isPublic, true);
    } finally {
        await context.cleanup();
    }
});

test('defaults archivedAt to null', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository);
        assert.equal(image.archivedAt, null);
    } finally {
        await context.cleanup();
    }
});

test('defaults tags and tagSlugs to empty arrays', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository);

        assert.deepEqual(image.tags, []);
        assert.deepEqual(image.tagSlugs, []);
    } finally {
        await context.cleanup();
    }
});

test('defaults createdAt and updatedAt', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository);

        assert.match(image.createdAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(image.updatedAt, image.createdAt);
    } finally {
        await context.cleanup();
    }
});

test('returns camelCase image fields', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository, {
            title: 'Title',
            description: 'Description',
            thumbnailKey: 'thumb.webp',
            mimeType: 'image/webp',
            width: 640,
            height: 480,
            sizeBytes: 123,
            isPublic: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        });

        assert.deepEqual(Object.keys(image), [
            'id',
            'ownerId',
            'title',
            'description',
            'storageKey',
            'thumbnailKey',
            'mimeType',
            'width',
            'height',
            'sizeBytes',
            'isPublic',
            'createdAt',
            'updatedAt',
            'deletedAt',
            'archivedAt',
            'tags',
            'tagSlugs',
        ]);
    } finally {
        await context.cleanup();
    }
});

test('stores storage keys but does not return imageUrl', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository);

        assert.equal(image.storageKey, 'users/owner-1/images/img-1.webp');
        assert.equal(Object.prototype.hasOwnProperty.call(image, 'imageUrl'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(image, 'thumbnailUrl'), false);
    } finally {
        await context.cleanup();
    }
});

test('stores and returns tags and tagSlugs as arrays', async () => {
    const context = await createRepositoryContext();
    try {
        const image = await createImage(context.repository, {
            tags: ['Dog', 'New York'],
            tagSlugs: ['dog', 'new-york'],
        });

        assert.deepEqual(image.tags, ['Dog', 'New York']);
        assert.deepEqual(image.tagSlugs, ['dog', 'new-york']);
    } finally {
        await context.cleanup();
    }
});

test('persists tags and tagSlugs after repository close and reopen', async () => {
    const context = await createRepositoryContext();
    let reopenedRepository;

    try {
        await createImage(context.repository, {
            tags: ['Dog', 'New York'],
            tagSlugs: ['dog', 'new-york'],
        });
        await context.repository.close();

        reopenedRepository = createSqliteImageRepository({
            config: {
                sqlitePath: context.sqlitePath,
            },
        });

        const image = await reopenedRepository.findImageById('img-1');

        assert.deepEqual(image.tags, ['Dog', 'New York']);
        assert.deepEqual(image.tagSlugs, ['dog', 'new-york']);
    } finally {
        if (reopenedRepository) {
            await reopenedRepository.close().catch(() => {});
        }
        await context.cleanup();
    }
});

test('rejects missing image id', async () => {
    const context = await createRepositoryContext();
    try {
        await assert.rejects(
            () => context.repository.createImage(createImageData({ id: '' })),
            /id/,
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects missing ownerId', async () => {
    const context = await createRepositoryContext();
    try {
        await assert.rejects(
            () => context.repository.createImage(createImageData({ ownerId: '' })),
            /ownerId/,
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects missing storageKey', async () => {
    const context = await createRepositoryContext();
    try {
        await assert.rejects(
            () => context.repository.createImage(createImageData({ storageKey: '' })),
            /storageKey/,
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects duplicate id', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);

        await assert.rejects(
            () => createImage(context.repository),
            /id/,
        );
    } finally {
        await context.cleanup();
    }
});

test('finds an existing image by id', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);

        const image = await context.repository.findImageById('img-1');

        assert.equal(image.id, 'img-1');
    } finally {
        await context.cleanup();
    }
});

test('returns null for a missing image id', async () => {
    const context = await createRepositoryContext();
    try {
        assert.equal(await context.repository.findImageById('missing'), null);
    } finally {
        await context.cleanup();
    }
});

test('excludes soft-deleted rows from findImageById by default', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);
        await context.repository.deleteImageById('img-1', 'owner-1');

        assert.equal(await context.repository.findImageById('img-1'), null);
    } finally {
        await context.cleanup();
    }
});

test('includes soft-deleted rows when includeDeleted === true', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);
        await context.repository.deleteImageById('img-1', 'owner-1');

        const image = await context.repository.findImageById('img-1', { includeDeleted: true });

        assert.equal(image.id, 'img-1');
        assert.match(image.deletedAt, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
        await context.cleanup();
    }
});

test('lists only public images from listPublicImages', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'public', isPublic: true });
        await createImage(context.repository, { id: 'private', isPublic: false });

        const images = await context.repository.listPublicImages();

        assert.deepEqual(images.map((image) => image.id), ['public']);
    } finally {
        await context.cleanup();
    }
});

test('excludes private images from listPublicImages', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'private', isPublic: false });

        const images = await context.repository.listPublicImages();

        assert.equal(images.length, 0);
    } finally {
        await context.cleanup();
    }
});

test('excludes soft-deleted images from listPublicImages', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'deleted', isPublic: true });
        await context.repository.deleteImageById('deleted', 'owner-1');

        const images = await context.repository.listPublicImages();

        assert.equal(images.length, 0);
    } finally {
        await context.cleanup();
    }
});

test('excludes archived images from listPublicImages', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'active', isPublic: true });
        await createImage(context.repository, { id: 'archived', isPublic: true });
        await context.repository.archiveImageById('archived', 'owner-1');

        const images = await context.repository.listPublicImages();

        assert.deepEqual(images.map((image) => image.id), ['active']);
    } finally {
        await context.cleanup();
    }
});

test('listPublicImages filters by tag slug', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, {
            id: 'dog',
            tags: ['Dog'],
            tagSlugs: ['dog'],
        });
        await createImage(context.repository, {
            id: 'cat',
            tags: ['Cat'],
            tagSlugs: ['cat'],
        });

        const images = await context.repository.listPublicImages({ tag: 'dog' });

        assert.deepEqual(images.map((image) => image.id), ['dog']);
    } finally {
        await context.cleanup();
    }
});

test('lists only images for the requested owner from listImagesByOwner', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'owner-1-image', ownerId: 'owner-1' });
        await createImage(context.repository, { id: 'owner-2-image', ownerId: 'owner-2' });

        const images = await context.repository.listImagesByOwner('owner-1');

        assert.deepEqual(images.map((image) => image.id), ['owner-1-image']);
    } finally {
        await context.cleanup();
    }
});

test('excludes other owners from listImagesByOwner', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'other-owner', ownerId: 'owner-2' });

        const images = await context.repository.listImagesByOwner('owner-1');

        assert.equal(images.length, 0);
    } finally {
        await context.cleanup();
    }
});

test('excludes soft-deleted rows from listImagesByOwner', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'deleted' });
        await context.repository.deleteImageById('deleted', 'owner-1');

        const images = await context.repository.listImagesByOwner('owner-1');

        assert.equal(images.length, 0);
    } finally {
        await context.cleanup();
    }
});

test('listImagesByOwner excludes archived rows by default', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'active' });
        await createImage(context.repository, { id: 'archived' });
        await context.repository.archiveImageById('archived', 'owner-1');

        const images = await context.repository.listImagesByOwner('owner-1');

        assert.deepEqual(images.map((image) => image.id), ['active']);
    } finally {
        await context.cleanup();
    }
});

test('listImagesByOwner archived=true returns archived only', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'active' });
        await createImage(context.repository, { id: 'archived' });
        await context.repository.archiveImageById('archived', 'owner-1');

        const images = await context.repository.listImagesByOwner('owner-1', { archived: true });

        assert.deepEqual(images.map((image) => image.id), ['archived']);
    } finally {
        await context.cleanup();
    }
});

test('listImagesByOwner includeArchived=true returns both archived and active rows', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'active', createdAt: '2026-01-02T00:00:00.000Z' });
        await createImage(context.repository, { id: 'archived', createdAt: '2026-01-01T00:00:00.000Z' });
        await context.repository.archiveImageById('archived', 'owner-1');

        const images = await context.repository.listImagesByOwner('owner-1', { includeArchived: true });

        assert.deepEqual(images.map((image) => image.id), ['active', 'archived']);
    } finally {
        await context.cleanup();
    }
});

test('listImagesByOwner filters by tag slug', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, {
            id: 'dog',
            tags: ['Dog'],
            tagSlugs: ['dog'],
        });
        await createImage(context.repository, {
            id: 'cat',
            tags: ['Cat'],
            tagSlugs: ['cat'],
        });

        const images = await context.repository.listImagesByOwner('owner-1', { tag: 'cat' });

        assert.deepEqual(images.map((image) => image.id), ['cat']);
    } finally {
        await context.cleanup();
    }
});

test('listImagesByOwner rejects invalid tag slug filters', async () => {
    const context = await createRepositoryContext();
    try {
        await assert.rejects(
            () => context.repository.listImagesByOwner('owner-1', { tag: 'Dog' }),
            /tag/,
        );
    } finally {
        await context.cleanup();
    }
});

test('orders list results by createdAt descending', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'older', createdAt: '2026-01-01T00:00:00.000Z' });
        await createImage(context.repository, { id: 'newer', createdAt: '2026-01-02T00:00:00.000Z' });

        const images = await context.repository.listPublicImages();

        assert.deepEqual(images.map((image) => image.id), ['newer', 'older']);
    } finally {
        await context.cleanup();
    }
});

test('supports limit', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'one', createdAt: '2026-01-01T00:00:00.000Z' });
        await createImage(context.repository, { id: 'two', createdAt: '2026-01-02T00:00:00.000Z' });

        const images = await context.repository.listPublicImages({ limit: 1 });

        assert.deepEqual(images.map((image) => image.id), ['two']);
    } finally {
        await context.cleanup();
    }
});

test('supports offset', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { id: 'one', createdAt: '2026-01-01T00:00:00.000Z' });
        await createImage(context.repository, { id: 'two', createdAt: '2026-01-02T00:00:00.000Z' });

        const images = await context.repository.listPublicImages({ offset: 1 });

        assert.deepEqual(images.map((image) => image.id), ['one']);
    } finally {
        await context.cleanup();
    }
});

test('caps limit at 200', async () => {
    const context = await createRepositoryContext();
    try {
        for (let index = 0; index < 205; index += 1) {
            await createImage(context.repository, {
                id: `img-${index}`,
                storageKey: `images/img-${index}.webp`,
                createdAt: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
            });
        }

        const images = await context.repository.listPublicImages({ limit: 500 });

        assert.equal(images.length, 200);
    } finally {
        await context.cleanup();
    }
});

test('rejects invalid limit', async () => {
    const context = await createRepositoryContext();
    try {
        await assert.rejects(
            () => context.repository.listPublicImages({ limit: 0 }),
            /limit/,
        );
    } finally {
        await context.cleanup();
    }
});

test('rejects invalid offset', async () => {
    const context = await createRepositoryContext();
    try {
        await assert.rejects(
            () => context.repository.listPublicImages({ offset: -1 }),
            /offset/,
        );
    } finally {
        await context.cleanup();
    }
});

test('update visibility changes isPublic', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { isPublic: true });

        const image = await context.repository.updateImageVisibility('img-1', 'owner-1', false);

        assert.equal(image.isPublic, false);
        assert.match(image.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
        await context.cleanup();
    }
});

test('update visibility requires owner', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, { isPublic: true });

        const image = await context.repository.updateImageVisibility('img-1', 'owner-2', false);

        assert.equal(image, null);
        assert.equal((await context.repository.findImageById('img-1')).isPublic, true);
    } finally {
        await context.cleanup();
    }
});

test('update visibility requires boolean isPublic', async () => {
    const context = await createRepositoryContext();
    try {
        await assert.rejects(
            () => context.repository.updateImageVisibility('img-1', 'owner-1', 'false'),
            /isPublic/,
        );
    } finally {
        await context.cleanup();
    }
});

test('archive sets archivedAt', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);

        const image = await context.repository.archiveImageById('img-1', 'owner-1');

        assert.match(image.archivedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(image.updatedAt, image.archivedAt);
    } finally {
        await context.cleanup();
    }
});

test('archive requires owner', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);

        const image = await context.repository.archiveImageById('img-1', 'owner-2');

        assert.equal(image, null);
        assert.equal((await context.repository.findImageById('img-1')).archivedAt, null);
    } finally {
        await context.cleanup();
    }
});

test('archive does not delete storage metadata', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository, {
            storageKey: 'users/owner-1/images/img-1.webp',
            thumbnailKey: 'users/owner-1/thumbnails/img-1.webp',
        });

        const image = await context.repository.archiveImageById('img-1', 'owner-1');

        assert.equal(image.storageKey, 'users/owner-1/images/img-1.webp');
        assert.equal(image.thumbnailKey, 'users/owner-1/thumbnails/img-1.webp');
        assert.equal(image.deletedAt, null);
    } finally {
        await context.cleanup();
    }
});

test('unarchive clears archivedAt', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);
        await context.repository.archiveImageById('img-1', 'owner-1');

        const image = await context.repository.unarchiveImageById('img-1', 'owner-1');

        assert.equal(image.archivedAt, null);
        assert.match(image.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
        await context.cleanup();
    }
});

test('archive and visibility updates exclude soft-deleted rows', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);
        await context.repository.deleteImageById('img-1', 'owner-1');

        assert.equal(await context.repository.updateImageVisibility('img-1', 'owner-1', false), null);
        assert.equal(await context.repository.archiveImageById('img-1', 'owner-1'), null);
        assert.equal(await context.repository.unarchiveImageById('img-1', 'owner-1'), null);
    } finally {
        await context.cleanup();
    }
});

test('soft-deletes an image by id and owner', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);
        await context.repository.deleteImageById('img-1', 'owner-1');

        const image = await context.repository.findImageById('img-1', { includeDeleted: true });

        assert.match(image.deletedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(image.updatedAt, image.deletedAt);
    } finally {
        await context.cleanup();
    }
});

test('delete returns deleted: true when a row is newly soft-deleted', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);

        const result = await context.repository.deleteImageById('img-1', 'owner-1');

        assert.deepEqual(result, { imageId: 'img-1', deleted: true });
    } finally {
        await context.cleanup();
    }
});

test('delete returns deleted: false when image id does not exist', async () => {
    const context = await createRepositoryContext();
    try {
        const result = await context.repository.deleteImageById('missing', 'owner-1');

        assert.deepEqual(result, { imageId: 'missing', deleted: false });
    } finally {
        await context.cleanup();
    }
});

test('delete returns deleted: false when owner id does not match', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);

        const result = await context.repository.deleteImageById('img-1', 'owner-2');

        assert.deepEqual(result, { imageId: 'img-1', deleted: false });
    } finally {
        await context.cleanup();
    }
});

test('delete returns deleted: false when image is already soft-deleted', async () => {
    const context = await createRepositoryContext();
    try {
        await createImage(context.repository);
        await context.repository.deleteImageById('img-1', 'owner-1');

        const result = await context.repository.deleteImageById('img-1', 'owner-1');

        assert.deepEqual(result, { imageId: 'img-1', deleted: false });
    } finally {
        await context.cleanup();
    }
});

test('close closes the database connection', async () => {
    const context = await createRepositoryContext();
    try {
        await context.repository.close();

        await assert.rejects(
            () => createImage(context.repository),
            /database connection is not open|closed/i,
        );
    } finally {
        await context.cleanup();
    }
});
