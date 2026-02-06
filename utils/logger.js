const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LOG_LEVEL_ORDER = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

const shouldLog = (level) =>
    (LOG_LEVEL_ORDER[level] ?? LOG_LEVEL_ORDER.info) <= (LOG_LEVEL_ORDER[LOG_LEVEL] ?? LOG_LEVEL_ORDER.info);

const log = (level, message, meta = {}) => {
    if (!shouldLog(level)) return;
    const payload = { level, message, timestamp: new Date().toISOString(), ...meta };
    const line = JSON.stringify(payload);
    if (level === 'error') {
        console.error(line);
    } else {
        console.log(line);
    }
};

const logError = (message, error, meta = {}) => {
    const payload = { error: error?.message, ...meta };
    if (shouldLog('debug') && error?.stack) payload.stack = error.stack;
    log('error', message, payload);
};

module.exports = { log, logError, shouldLog };
