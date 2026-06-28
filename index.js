require('dotenv').config();

const { createApp } = require('./app');
const { config } = require('./config/env');
const { getBucket } = require('./config/firebase');
const { createContainer } = require('./config/container');
const { createProviderRegistry } = require('./config/providerRegistry');
const { log } = require('./utils/logger');

const providerRegistry = createProviderRegistry();
const container = createContainer(config, providerRegistry);
const app = createApp({ container, legacyBucketGetter: getBucket });

app.listen(config.port, '0.0.0.0', () => {
    log('info', 'Server is running', { port: config.port });
});
