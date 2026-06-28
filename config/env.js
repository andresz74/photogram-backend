const DEFAULTS = {
    NODE_ENV: 'development',
    PORT: '3000',
    AUTH_PROVIDER: 'firebase',
    DATABASE_PROVIDER: 'sqlite',
    STORAGE_PROVIDER: 'local',
    SQLITE_PATH: './data/photogram.sqlite',
    LOCAL_STORAGE_ROOT: './data/images',
    PUBLIC_MEDIA_BASE_URL: 'http://localhost:3000/media',
    FIREBASE_URL_MODE: 'signed',
    FIREBASE_SIGNED_URL_EXPIRES_SECONDS: '300',
    LOW_MEMORY_MODE: 'true',
    MAX_FILE_SIZE_MB: '5',
    RESIZE_CONCURRENCY: '1',
    HEAVY_RATE_LIMIT_MAX: '8',
    ENABLE_DEBUG_ENDPOINT: 'false',
    IMAGE_PROCESSOR: 'sharp',
    DEFAULT_RATE_LIMIT_MAX: '60',
    UPLOAD_TEMP_CLEANUP_ENABLED: 'true',
    UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS: '300',
    UPLOAD_TEMP_STALE_AGE_SECONDS: '900',
    FIREBASE_UPLOAD_ACL: 'publicRead',
};

const AUTH_PROVIDERS = new Set(['firebase', 'local']);
const DATABASE_PROVIDERS = new Set(['firebase', 'sqlite']);
const STORAGE_PROVIDERS = new Set(['firebase', 'local']);
const IMAGE_PROCESSORS = new Set(['sharp', 'jimp']);
const FIREBASE_URL_MODES = new Set(['public', 'signed']);

const LOW_MEMORY_MAX_FILE_SIZE_MB = 10;
const STANDARD_MAX_FILE_SIZE_MB = 25;
const LOW_MEMORY_RESIZE_CONCURRENCY_CAP = 1;
const STANDARD_RESIZE_CONCURRENCY_CAP = 4;
const LOW_MEMORY_HEAVY_RATE_LIMIT_CAP = 12;
const STANDARD_HEAVY_RATE_LIMIT_CAP = 40;

const readValue = (source, envName) => {
    const value = source[envName];
    if (value === undefined || value === null || value === '') {
        return DEFAULTS[envName];
    }
    return String(value);
};

const requireValue = (source, envName) => {
    const value = source[envName];
    if (value === undefined || value === null || String(value).trim() === '') {
        throw new Error(`${envName} is required for the selected provider configuration.`);
    }
    return String(value);
};

const parseEnum = (source, envName, allowedValues) => {
    const value = readValue(source, envName).toLowerCase();
    if (!allowedValues.has(value)) {
        throw new Error(`${envName} must be one of: ${Array.from(allowedValues).join(', ')}.`);
    }
    return value;
};

const parseBoolean = (source, envName) => {
    const value = readValue(source, envName).toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${envName} must be either true or false.`);
};

const parsePositiveInteger = (source, envName) => {
    const raw = readValue(source, envName);
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${envName} must be a positive integer.`);
    }
    return value;
};

const clamp = (value, max) => Math.min(value, max);

const readEnv = (source = process.env) => {
    const nodeEnv = readValue(source, 'NODE_ENV');
    const port = parsePositiveInteger(source, 'PORT');

    const authProvider = parseEnum(source, 'AUTH_PROVIDER', AUTH_PROVIDERS);
    const databaseProvider = parseEnum(source, 'DATABASE_PROVIDER', DATABASE_PROVIDERS);
    const storageProvider = parseEnum(source, 'STORAGE_PROVIDER', STORAGE_PROVIDERS);

    const lowMemoryMode = parseBoolean(source, 'LOW_MEMORY_MODE');
    const requestedMaxFileSizeMb = parsePositiveInteger(source, 'MAX_FILE_SIZE_MB');
    const requestedResizeConcurrency = parsePositiveInteger(source, 'RESIZE_CONCURRENCY');
    const requestedHeavyRateLimitMax = parsePositiveInteger(source, 'HEAVY_RATE_LIMIT_MAX');

    const maxFileSizeMbCap = lowMemoryMode ? LOW_MEMORY_MAX_FILE_SIZE_MB : STANDARD_MAX_FILE_SIZE_MB;
    const resizeConcurrencyCap = lowMemoryMode ? LOW_MEMORY_RESIZE_CONCURRENCY_CAP : STANDARD_RESIZE_CONCURRENCY_CAP;
    const heavyRateLimitCap = lowMemoryMode ? LOW_MEMORY_HEAVY_RATE_LIMIT_CAP : STANDARD_HEAVY_RATE_LIMIT_CAP;

    const maxFileSizeMb = clamp(requestedMaxFileSizeMb, maxFileSizeMbCap);
    const resizeConcurrency = clamp(requestedResizeConcurrency, resizeConcurrencyCap);
    const heavyRateLimitMax = clamp(requestedHeavyRateLimitMax, heavyRateLimitCap);

    const sqlitePath = databaseProvider === 'sqlite'
        ? readValue(source, 'SQLITE_PATH')
        : source.SQLITE_PATH ? String(source.SQLITE_PATH) : undefined;
    const localStorageRoot = storageProvider === 'local'
        ? readValue(source, 'LOCAL_STORAGE_ROOT')
        : source.LOCAL_STORAGE_ROOT ? String(source.LOCAL_STORAGE_ROOT) : undefined;
    const publicMediaBaseUrl = storageProvider === 'local'
        ? readValue(source, 'PUBLIC_MEDIA_BASE_URL')
        : source.PUBLIC_MEDIA_BASE_URL ? String(source.PUBLIC_MEDIA_BASE_URL) : undefined;

    const usesFirebase = authProvider === 'firebase'
        || databaseProvider === 'firebase'
        || storageProvider === 'firebase';
    const firebaseServiceAccountPath = usesFirebase
        ? requireValue(source, 'FIREBASE_SERVICE_ACCOUNT_PATH')
        : source.FIREBASE_SERVICE_ACCOUNT_PATH ? String(source.FIREBASE_SERVICE_ACCOUNT_PATH) : undefined;
    const firebaseStorageBucket = storageProvider === 'firebase'
        ? requireValue(source, 'FIREBASE_STORAGE_BUCKET')
        : source.FIREBASE_STORAGE_BUCKET ? String(source.FIREBASE_STORAGE_BUCKET) : undefined;

    const firebaseUrlMode = parseEnum(source, 'FIREBASE_URL_MODE', FIREBASE_URL_MODES);
    const firebaseSignedUrlExpiresSeconds = parsePositiveInteger(source, 'FIREBASE_SIGNED_URL_EXPIRES_SECONDS');
    const enableDebugEndpoint = parseBoolean(source, 'ENABLE_DEBUG_ENDPOINT');
    const imageProcessor = parseEnum(source, 'IMAGE_PROCESSOR', IMAGE_PROCESSORS);

    const defaultRateLimitMax = parsePositiveInteger(source, 'DEFAULT_RATE_LIMIT_MAX');
    const uploadTempCleanupEnabled = parseBoolean(source, 'UPLOAD_TEMP_CLEANUP_ENABLED');
    const uploadTempCleanupIntervalSeconds = parsePositiveInteger(source, 'UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS');
    const uploadTempStaleAgeSeconds = parsePositiveInteger(source, 'UPLOAD_TEMP_STALE_AGE_SECONDS');
    const firebaseUploadAcl = readValue(source, 'FIREBASE_UPLOAD_ACL');

    return {
        nodeEnv,
        port,
        authProvider,
        databaseProvider,
        storageProvider,
        sqlitePath,
        localStorageRoot,
        publicMediaBaseUrl,
        firebaseServiceAccountPath,
        firebaseStorageBucket,
        firebaseUrlMode,
        firebaseSignedUrlExpiresSeconds,
        lowMemoryMode,
        maxFileSizeMb,
        resizeConcurrency,
        heavyRateLimitMax,
        enableDebugEndpoint,
        imageProcessor,
        maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
        maxFileSizeWasClamped: requestedMaxFileSizeMb > maxFileSizeMbCap,
        resizeConcurrencyWasClamped: requestedResizeConcurrency > resizeConcurrencyCap,
        heavyRateLimitWasClamped: requestedHeavyRateLimitMax > heavyRateLimitCap,
        defaultRateLimitMax,
        uploadTempCleanupEnabled,
        uploadTempCleanupIntervalSeconds,
        uploadTempStaleAgeSeconds,
        firebaseUploadAcl,
    };
};

const config = readEnv();

module.exports = {
    readEnv,
    config,
    LOW_MEMORY_MODE: config.lowMemoryMode,
    MAX_FILE_SIZE_MB: config.maxFileSizeMb,
    MAX_FILE_SIZE: config.maxFileSizeBytes,
    MAX_FILE_SIZE_WAS_CLAMPED: config.maxFileSizeWasClamped,
    IMAGE_PROCESSOR: config.imageProcessor,
    RESIZE_CONCURRENCY: config.resizeConcurrency,
    RESIZE_CONCURRENCY_WAS_CLAMPED: config.resizeConcurrencyWasClamped,
    DEFAULT_RATE_LIMIT_MAX: config.defaultRateLimitMax,
    HEAVY_RATE_LIMIT_MAX: config.heavyRateLimitMax,
    HEAVY_RATE_LIMIT_WAS_CLAMPED: config.heavyRateLimitWasClamped,
    ENABLE_DEBUG_ENDPOINT: config.enableDebugEndpoint,
    UPLOAD_TEMP_CLEANUP_ENABLED: config.uploadTempCleanupEnabled,
    UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS: config.uploadTempCleanupIntervalSeconds,
    UPLOAD_TEMP_STALE_AGE_SECONDS: config.uploadTempStaleAgeSeconds,
    FIREBASE_STORAGE_BUCKET: config.firebaseStorageBucket,
    FIREBASE_SERVICE_ACCOUNT_PATH: config.firebaseServiceAccountPath,
    FIREBASE_UPLOAD_ACL: config.firebaseUploadAcl,
    FIREBASE_URL_MODE: config.firebaseUrlMode,
    FIREBASE_SIGNED_URL_EXPIRES_SECONDS: config.firebaseSignedUrlExpiresSeconds,
    PORT: config.port,
};
