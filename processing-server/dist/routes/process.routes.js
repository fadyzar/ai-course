"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processRoutes = processRoutes;
const process_controller_js_1 = require("../controllers/process.controller.js");
async function verifyApiKey(request, reply) {
    const apiKey = process.env.PROCESSING_SERVER_API_KEY;
    if (!apiKey)
        return; // No key configured = open (dev mode)
    const provided = request.headers['x-api-key'] ||
        (request.headers.authorization?.startsWith('Bearer ')
            ? request.headers.authorization.slice(7)
            : null);
    if (!provided || provided !== apiKey) {
        reply.status(401).send({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
}
async function processRoutes(fastify) {
    fastify.addHook('preHandler', verifyApiKey);
    fastify.post('/process-asset', {
        schema: {
            body: {
                type: 'object',
                required: ['assetId', 'courseId'],
                properties: {
                    assetId: { type: 'string' },
                    courseId: { type: 'string' },
                    userId: { type: 'string' },
                },
            },
        },
    }, process_controller_js_1.handleProcessAsset);
    fastify.post('/process-job', {
        schema: {
            body: {
                type: 'object',
                required: ['jobId'],
                properties: {
                    jobId: { type: 'string' },
                },
            },
        },
    }, process_controller_js_1.handleProcessJob);
    fastify.post('/process-job-sync', {
        schema: {
            body: {
                type: 'object',
                required: ['jobId'],
                properties: {
                    jobId: { type: 'string' },
                },
            },
        },
    }, process_controller_js_1.handleProcessJobSync);
    fastify.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    }));
}
