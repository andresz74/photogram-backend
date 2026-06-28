const { createFirebaseAuthProvider } = require('../auth/firebaseAuthProvider');
const { createSqliteImageRepository } = require('../repositories/sqliteImageRepository');
const { createLocalStorageProvider } = require('../storage/localStorageProvider');

function createProviderRegistry(dependencies = {}) {
    return {
        authProviders: {
            firebase: ({ config }) => createFirebaseAuthProvider({
                config,
                firebaseAuth: dependencies.firebaseAuth,
            }),
        },
        imageRepositories: {
            sqlite: createSqliteImageRepository,
        },
        storageProviders: {
            local: createLocalStorageProvider,
        },
    };
}

module.exports = {
    createProviderRegistry,
};
