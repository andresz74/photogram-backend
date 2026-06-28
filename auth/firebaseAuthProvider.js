const createUnauthorizedError = (message) => {
    const error = new Error(message);
    error.statusCode = 401;
    error.code = 'UNAUTHENTICATED';
    return error;
};

const getAuthorizationHeader = (req) => {
    if (!req || !req.headers) return null;
    return req.headers.authorization || req.headers.Authorization || null;
};

const parseBearerToken = (authorizationHeader) => {
    if (!authorizationHeader) return null;

    const parts = authorizationHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
        throw createUnauthorizedError('Authorization header must use the Bearer scheme.');
    }

    if (!parts[1]) {
        throw createUnauthorizedError('Bearer token must not be empty.');
    }

    return parts[1];
};

const resolveFirebaseAuth = () => {
    const { getAuth } = require('../config/firebase');
    return getAuth();
};

const normalizeUser = (decodedToken) => {
    const uid = decodedToken && (decodedToken.uid || decodedToken.user_id || decodedToken.sub);
    if (!uid) {
        throw createUnauthorizedError('Verified Firebase token does not contain a usable UID.');
    }

    return {
        uid,
        email: decodedToken.email ?? null,
        emailVerified: decodedToken.email_verified ?? decodedToken.emailVerified ?? false,
        displayName: decodedToken.name ?? decodedToken.displayName ?? null,
        photoUrl: decodedToken.picture ?? decodedToken.photoUrl ?? null,
        claims: decodedToken,
    };
};

function createFirebaseAuthProvider({ config, firebaseAuth } = {}) {
    let resolvedFirebaseAuth = firebaseAuth;

    const getFirebaseAuth = () => {
        if (!resolvedFirebaseAuth) {
            resolvedFirebaseAuth = resolveFirebaseAuth();
        }

        if (!resolvedFirebaseAuth || typeof resolvedFirebaseAuth.verifyIdToken !== 'function') {
            throw createUnauthorizedError('Firebase Auth verifier is not available.');
        }

        return resolvedFirebaseAuth;
    };

    const getCurrentUser = async (req) => {
        const token = parseBearerToken(getAuthorizationHeader(req));
        if (!token) return null;

        let decodedToken;
        try {
            decodedToken = await getFirebaseAuth().verifyIdToken(token);
        } catch (error) {
            throw createUnauthorizedError(`Invalid Firebase ID token: ${error.message}`);
        }

        return normalizeUser(decodedToken);
    };

    const requireUser = async (req) => {
        const user = await getCurrentUser(req);
        if (!user) {
            throw createUnauthorizedError('Authentication is required.');
        }

        return user;
    };

    return {
        getCurrentUser,
        requireUser,
    };
}

module.exports = {
    createFirebaseAuthProvider,
};
