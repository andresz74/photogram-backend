const os = require('os');

const DEFAULT_MAX_FILE_SIZE_MB = 5;
const DEFAULT_RESIZE_CONCURRENCY = 1;
const LOW_MEMORY_THRESHOLD_BYTES = 3 * 1024 * 1024 * 1024;
const LOW_MEMORY_MAX_FILE_SIZE_MB = 10;
const STANDARD_MAX_FILE_SIZE_MB = 25;
const LOW_MEMORY_RESIZE_CONCURRENCY_CAP = 1;
const STANDARD_RESIZE_CONCURRENCY_CAP = 4;

const normalizeBooleanMode = (value, fallback) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
};

const toPositiveNumberOrDefault = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const detectedLowMemoryMode = os.totalmem() <= LOW_MEMORY_THRESHOLD_BYTES;
const LOW_MEMORY_MODE = normalizeBooleanMode(
    (process.env.LOW_MEMORY_MODE || 'auto').toLowerCase(),
    detectedLowMemoryMode,
);

const maxFileSizeMbCap = LOW_MEMORY_MODE ? LOW_MEMORY_MAX_FILE_SIZE_MB : STANDARD_MAX_FILE_SIZE_MB;
const requestedMaxFileSizeMb = toPositiveNumberOrDefault(process.env.MAX_FILE_SIZE_MB, DEFAULT_MAX_FILE_SIZE_MB);
const MAX_FILE_SIZE_MB = Math.min(requestedMaxFileSizeMb, maxFileSizeMbCap);
const MAX_FILE_SIZE_WAS_CLAMPED = requestedMaxFileSizeMb > maxFileSizeMbCap;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

const IMAGE_PROCESSOR = (process.env.IMAGE_PROCESSOR || 'sharp').toLowerCase();

const resizeConcurrencyCap = LOW_MEMORY_MODE ? LOW_MEMORY_RESIZE_CONCURRENCY_CAP : STANDARD_RESIZE_CONCURRENCY_CAP;
const requestedResizeConcurrency = toPositiveNumberOrDefault(process.env.RESIZE_CONCURRENCY, DEFAULT_RESIZE_CONCURRENCY);
const RESIZE_CONCURRENCY = Math.min(Math.floor(requestedResizeConcurrency), resizeConcurrencyCap);
const RESIZE_CONCURRENCY_WAS_CLAMPED = requestedResizeConcurrency > resizeConcurrencyCap;

const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'photograma-c2078.appspot.com';
const FIREBASE_UPLOAD_ACL = process.env.FIREBASE_UPLOAD_ACL || 'publicRead';
const FIREBASE_URL_MODE = (process.env.FIREBASE_URL_MODE || 'public').toLowerCase();
const signedUrlExpiresSecondsEnv = Number(process.env.FIREBASE_SIGNED_URL_EXPIRES_SECONDS);
const FIREBASE_SIGNED_URL_EXPIRES_SECONDS = Number.isFinite(signedUrlExpiresSecondsEnv) && signedUrlExpiresSecondsEnv > 0
    ? signedUrlExpiresSecondsEnv
    : 900;
const PORT = process.env.PORT || 3000;

module.exports = {
    LOW_MEMORY_MODE,
    MAX_FILE_SIZE_MB,
    MAX_FILE_SIZE,
    MAX_FILE_SIZE_WAS_CLAMPED,
    IMAGE_PROCESSOR,
    RESIZE_CONCURRENCY,
    RESIZE_CONCURRENCY_WAS_CLAMPED,
    FIREBASE_STORAGE_BUCKET,
    FIREBASE_UPLOAD_ACL,
    FIREBASE_URL_MODE,
    FIREBASE_SIGNED_URL_EXPIRES_SECONDS,
    PORT,
};
