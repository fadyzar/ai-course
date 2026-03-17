"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const process_routes_js_1 = require("./routes/process.routes.js");
const logger_js_1 = require("./utils/logger.js");
const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['*'];
const fastify = (0, fastify_1.default)({
    logger: false,
    bodyLimit: 1048576,
});
async function bootstrap() {
    await fastify.register(cors_1.default, {
        origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
    });
    await fastify.register(process_routes_js_1.processRoutes);
    fastify.setErrorHandler((error, request, reply) => {
        logger_js_1.logger.error({ err: error.message, url: request.url }, 'Unhandled error');
        reply.status(error.statusCode || 500).send({
            success: false,
            error: error.message,
            code: 'SERVER_ERROR',
        });
    });
    await fastify.listen({ port: PORT, host: HOST });
    logger_js_1.logger.info({ port: PORT, host: HOST }, `Processing server running`);
}
bootstrap().catch((err) => {
    logger_js_1.logger.error({ err: err.message }, 'Fatal startup error');
    process.exit(1);
});
