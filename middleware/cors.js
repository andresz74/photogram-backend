const cors = require('cors');

const allowedOrigins = new Set([
    'https://apps.andreszenteno.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://192.168.1.181:3000',
    'https://192.168.1.181',
    'http://192.168.1.242:3001',
    'https://photogram.andreszenteno.com',
]);

const corsMiddleware = cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
});

module.exports = { corsMiddleware, allowedOrigins };
