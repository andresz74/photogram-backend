const PUBLIC_URL_MODE = 'public';
const SIGNED_URL_MODE = 'signed';

const buildPublicUrl = (bucketName, fileName) => `https://storage.googleapis.com/${bucketName}/${fileName}`;

const resolveStorageUrl = async ({ file, bucketName, fileName, urlMode, signedUrlExpiresSeconds }) => {
    if (urlMode === SIGNED_URL_MODE) {
        const expiresAt = Date.now() + (signedUrlExpiresSeconds * 1000);
        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: expiresAt,
        });
        return url;
    }

    return buildPublicUrl(bucketName, fileName);
};

module.exports = {
    PUBLIC_URL_MODE,
    SIGNED_URL_MODE,
    buildPublicUrl,
    resolveStorageUrl,
};
