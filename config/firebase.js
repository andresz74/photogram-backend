const admin = require('firebase-admin');

const { FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_STORAGE_BUCKET } = require('./env');
const { log } = require('../utils/logger');

if (!FIREBASE_SERVICE_ACCOUNT_PATH) {
    log('error', 'FIREBASE_SERVICE_ACCOUNT_PATH is required and must point to a Firebase service account JSON file.');
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = require(FIREBASE_SERVICE_ACCOUNT_PATH);
} catch (error) {
    log('error', 'Failed to load service account from path', {
        path: FIREBASE_SERVICE_ACCOUNT_PATH,
        error: error.message,
    });
    process.exit(1);
}

if (!admin.apps.length) {
    const appConfig = {
        credential: admin.credential.cert(serviceAccount),
    };

    if (FIREBASE_STORAGE_BUCKET) {
        appConfig.storageBucket = FIREBASE_STORAGE_BUCKET;
    }

    admin.initializeApp(appConfig);
}

let bucketInstance = null;

const getBucket = () => {
    if (!FIREBASE_STORAGE_BUCKET) {
        throw new Error('FIREBASE_STORAGE_BUCKET is required before Firebase Storage bucket access.');
    }

    if (!bucketInstance) {
        bucketInstance = admin.storage().bucket(FIREBASE_STORAGE_BUCKET);
    }

    return bucketInstance;
};

const bucket = new Proxy({}, {
    get(_target, property) {
        const resolvedBucket = getBucket();
        const value = resolvedBucket[property];

        if (typeof value === 'function') {
            return value.bind(resolvedBucket);
        }

        return value;
    },
});

const getAuth = () => admin.auth();

module.exports = {
    admin,
    bucket,
    getAuth,
    getBucket,
};
