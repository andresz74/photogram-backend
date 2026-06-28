const { createImageProcessor } = require('../services/imageProcessor');
const { createImagePresenter } = require('../services/imagePresenter');
const { createImageService } = require('../services/imageService');
const { createImageUploadService } = require('../services/imageUploadService');

const requireObject = (value, name) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${name} must be an object.`);
    }
    return value;
};

const resolveFactory = (registry, providerName, envName, providerType) => {
    const factory = registry[providerName];

    if (factory === undefined) {
        throw new Error(`${envName} selected "${providerName}", but no ${providerType} factory is registered.`);
    }

    if (typeof factory !== 'function') {
        throw new Error(`${envName} selected "${providerName}", but the ${providerType} registry value must be a function.`);
    }

    return factory;
};

const createProvider = (factory, providerType, context) => {
    const provider = factory(context);

    if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
        throw new Error(`${providerType} factory must return an object.`);
    }

    return provider;
};

const createContainer = (config, providerRegistry) => {
    requireObject(config, 'config');
    requireObject(providerRegistry, 'providerRegistry');

    const authProviders = requireObject(providerRegistry.authProviders, 'providerRegistry.authProviders');
    const imageRepositories = requireObject(providerRegistry.imageRepositories, 'providerRegistry.imageRepositories');
    const storageProviders = requireObject(providerRegistry.storageProviders, 'providerRegistry.storageProviders');

    const authFactory = resolveFactory(authProviders, config.authProvider, 'AUTH_PROVIDER', 'auth provider');
    const imageRepositoryFactory = resolveFactory(
        imageRepositories,
        config.databaseProvider,
        'DATABASE_PROVIDER',
        'image repository',
    );
    const storageProviderFactory = resolveFactory(
        storageProviders,
        config.storageProvider,
        'STORAGE_PROVIDER',
        'storage provider',
    );

    const context = { config };
    const authProvider = createProvider(authFactory, 'auth provider', context);
    const imageRepository = createProvider(imageRepositoryFactory, 'image repository', context);
    const storageProvider = createProvider(storageProviderFactory, 'storage provider', context);
    const imagePresenter = createImagePresenter({ storageProvider });
    const imageService = createImageService({
        imageRepository,
        storageProvider,
        imagePresenter,
    });
    const imageProcessor = createImageProcessor({
        processorName: config.imageProcessor,
    });
    const imageUploadService = createImageUploadService({
        config,
        storageProvider,
        imageService,
        imageProcessor,
    });

    return {
        config,
        authProvider,
        imageRepository,
        storageProvider,
        imagePresenter,
        imageService,
        imageUploadService,
    };
};

module.exports = {
    createContainer,
    requireObject,
    resolveFactory,
    createProvider,
};
