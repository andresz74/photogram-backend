const admin = require('firebase-admin');

const { FIREBASE_STORAGE_BUCKET } = require('./env');
const { log } = require('../utils/logger');

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
    log('error', 'FIREBASE_SERVICE_ACCOUNT_PATH is required and must point to a Firebase service account JSON file.');
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = require(serviceAccountPath);
} catch (error) {
    log('error', 'Failed to load service account from path', {
        path: serviceAccountPath,
        error: error.message,
    });
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: FIREBASE_STORAGE_BUCKET,
    });
}

const bucket = admin.storage().bucket();

module.exports = { admin, bucket };
