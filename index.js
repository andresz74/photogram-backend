require('dotenv').config();

const { PORT } = require('./config/env');
const { createApp } = require('./app');
const { log } = require('./utils/logger');

const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
    log('info', 'Server is running', { port: PORT });
});
