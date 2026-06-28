const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const requireConfig = (config) => {
    if (!config || typeof config !== 'object') {
        throw new Error('config is required for local storage provider.');
    }
    if (!config.localStorageRoot) {
        throw new Error('config.localStorageRoot is required for local storage provider.');
    }
    if (!config.publicMediaBaseUrl) {
        throw new Error('config.publicMediaBaseUrl is required for local storage provider.');
    }
};

const validateStorageKey = (storageKey) => {
    if (typeof storageKey !== 'string' || storageKey.length === 0) {
        throw new Error('Invalid storage key: storageKey is required.');
    }
    if (storageKey.includes('\0')) {
        throw new Error('Invalid storage key: null bytes are not allowed.');
    }
    if (path.isAbsolute(storageKey)) {
        throw new Error('Invalid storage key: absolute paths are not allowed.');
    }
    if (storageKey.includes('\\')) {
        throw new Error('Invalid storage key: backslashes are not allowed.');
    }
    if (storageKey.endsWith('/')) {
        throw new Error('Invalid storage key: keys must not end with /.');
    }

    const segments = storageKey.split('/');
    if (segments.some((segment) => segment === '..')) {
        throw new Error('Invalid storage key: .. path segments are not allowed.');
    }
};

const resolveObjectPath = (rootPath, storageKey) => {
    validateStorageKey(storageKey);

    const objectPath = path.resolve(rootPath, storageKey);
    if (objectPath !== rootPath && !objectPath.startsWith(rootPath + path.sep)) {
        throw new Error('Invalid storage key: path escapes LOCAL_STORAGE_ROOT.');
    }

    return objectPath;
};

const encodeStorageKeyForUrl = (storageKey) =>
    storageKey.split('/').map((segment) => encodeURIComponent(segment)).join('/');

const pathExistsAsFile = async (filePath) => {
    try {
        const stats = await fs.stat(filePath);
        return stats.isFile();
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
};

const createLocalStorageProvider = ({ config } = {}) => {
    requireConfig(config);

    const rootPath = path.resolve(config.localStorageRoot);
    const publicMediaBaseUrl = config.publicMediaBaseUrl.replace(/\/+$/, '');

    const saveObject = async ({ storageKey, readableStream, buffer, overwrite } = {}) => {
        if (!readableStream && !buffer) {
            throw new Error('Either readableStream or buffer is required to save an object.');
        }

        const objectPath = resolveObjectPath(rootPath, storageKey);
        const exists = await pathExistsAsFile(objectPath);
        if (exists && overwrite !== true) {
            throw new Error(`Object already exists for storageKey: ${storageKey}`);
        }

        await fs.mkdir(path.dirname(objectPath), { recursive: true });

        if (readableStream) {
            await pipeline(readableStream, fsSync.createWriteStream(objectPath, { flags: overwrite === true ? 'w' : 'wx' }));
        } else {
            await fs.writeFile(objectPath, buffer, { flag: overwrite === true ? 'w' : 'wx' });
        }

        const stats = await fs.stat(objectPath);
        return {
            storageKey,
            sizeBytes: stats.size,
        };
    };

    const deleteObject = async (storageKey) => {
        const objectPath = resolveObjectPath(rootPath, storageKey);
        const exists = await pathExistsAsFile(objectPath);
        if (!exists) {
            return { storageKey, deleted: false };
        }

        await fs.unlink(objectPath);
        return { storageKey, deleted: true };
    };

    const getUrl = (storageKey) => {
        validateStorageKey(storageKey);
        return `${publicMediaBaseUrl}/${encodeStorageKeyForUrl(storageKey)}`;
    };

    const createReadStream = (storageKey) => {
        const objectPath = resolveObjectPath(rootPath, storageKey);
        return fsSync.createReadStream(objectPath);
    };

    const objectExists = async (storageKey) => {
        const objectPath = resolveObjectPath(rootPath, storageKey);
        return pathExistsAsFile(objectPath);
    };

    return {
        saveObject,
        deleteObject,
        getUrl,
        createReadStream,
        objectExists,
    };
};

module.exports = {
    createLocalStorageProvider,
};
