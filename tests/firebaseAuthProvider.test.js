const test = require('node:test');
const assert = require('node:assert/strict');

const { createFirebaseAuthProvider } = require('../auth/firebaseAuthProvider');

const createFakeFirebaseAuth = (decodedToken, options = {}) => {
    const calls = [];
    return {
        calls,
        async verifyIdToken(token) {
            calls.push(token);
            if (options.reject) {
                throw new Error(options.reject);
            }
            return decodedToken;
        },
    };
};

const createRequest = (authorization) => ({
    headers: authorization === undefined ? {} : { authorization },
});

const assertUnauthorized = async (callback) => {
    await assert.rejects(
        callback,
        (error) => error instanceof Error
            && error.statusCode === 401
            && error.code === 'UNAUTHENTICATED',
    );
};

test('creates a Firebase Auth provider', () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    assert.equal(typeof provider.getCurrentUser, 'function');
    assert.equal(typeof provider.requireUser, 'function');
});

test('getCurrentUser returns null when Authorization header is missing', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    const user = await provider.getCurrentUser({ headers: {} });

    assert.equal(user, null);
});

test('rejects non-Bearer Authorization header', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    await assertUnauthorized(() => provider.getCurrentUser(createRequest('Basic token')));
});

test('rejects empty Bearer token', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    await assertUnauthorized(() => provider.getCurrentUser(createRequest('Bearer ')));
});

test('calls verifyIdToken with the extracted token', async () => {
    const firebaseAuth = createFakeFirebaseAuth({ uid: 'user-1' });
    const provider = createFirebaseAuthProvider({ firebaseAuth });

    await provider.getCurrentUser(createRequest('Bearer token-1'));

    assert.deepEqual(firebaseAuth.calls, ['token-1']);
});

test('normalizes decoded token with uid', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1', email: 'user@example.com' }),
    });

    const user = await provider.getCurrentUser(createRequest('Bearer token-1'));

    assert.equal(user.uid, 'user-1');
    assert.equal(user.email, 'user@example.com');
});

test('normalizes decoded token with user_id fallback', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ user_id: 'user-2' }),
    });

    const user = await provider.getCurrentUser(createRequest('Bearer token-1'));

    assert.equal(user.uid, 'user-2');
});

test('normalizes decoded token with sub fallback', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ sub: 'user-3' }),
    });

    const user = await provider.getCurrentUser(createRequest('Bearer token-1'));

    assert.equal(user.uid, 'user-3');
});

test('defaults optional user fields to null or false', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    const user = await provider.getCurrentUser(createRequest('Bearer token-1'));

    assert.equal(user.email, null);
    assert.equal(user.emailVerified, false);
    assert.equal(user.displayName, null);
    assert.equal(user.photoUrl, null);
});

test('includes original decoded token as claims', async () => {
    const decodedToken = { uid: 'user-1', custom: 'claim' };
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth(decodedToken),
    });

    const user = await provider.getCurrentUser(createRequest('Bearer token-1'));

    assert.equal(user.claims, decodedToken);
});

test('rejects verified token with no usable UID', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ email: 'user@example.com' }),
    });

    await assertUnauthorized(() => provider.getCurrentUser(createRequest('Bearer token-1')));
});

test('converts Firebase verification failure into unauthorized error', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth(null, { reject: 'expired token' }),
    });

    await assertUnauthorized(() => provider.getCurrentUser(createRequest('Bearer token-1')));
});

test('requireUser returns user when token is valid', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    const user = await provider.requireUser(createRequest('Bearer token-1'));

    assert.equal(user.uid, 'user-1');
});

test('requireUser throws unauthorized when no user is present', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    await assertUnauthorized(() => provider.requireUser({ headers: {} }));
});

test('unauthorized errors include statusCode = 401', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    await assert.rejects(
        () => provider.requireUser({ headers: {} }),
        (error) => error.statusCode === 401,
    );
});

test('unauthorized errors include code = UNAUTHENTICATED', async () => {
    const provider = createFirebaseAuthProvider({
        firebaseAuth: createFakeFirebaseAuth({ uid: 'user-1' }),
    });

    await assert.rejects(
        () => provider.requireUser({ headers: {} }),
        (error) => error.code === 'UNAUTHENTICATED',
    );
});

test('provider does not require real Firebase when fake firebaseAuth is passed', async () => {
    const firebaseAuth = createFakeFirebaseAuth({ uid: 'user-1' });
    const provider = createFirebaseAuthProvider({ firebaseAuth });

    const user = await provider.getCurrentUser({
        headers: {
            Authorization: 'Bearer token-1',
        },
    });

    assert.equal(user.uid, 'user-1');
    assert.deepEqual(firebaseAuth.calls, ['token-1']);
});
