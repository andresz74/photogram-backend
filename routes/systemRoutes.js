const express = require('express');

const createSystemRouter = ({ defaultLimiter }) => {
    const router = express.Router();

    router.get('/health', defaultLimiter, (req, res) => {
        res.send('OK');
    });

    router.get('/debug', defaultLimiter, (req, res) => {
        res.json({
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            region: process.env.VERCEL_REGION || 'local',
        });
    });

    return router;
};

module.exports = { createSystemRouter };
