import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { processRoutes } from './routes/process.routes.js';
import { logger } from './utils/logger.js';

// ─── Validate critical env vars at startup ────────────────────────────────────
function validateEnv() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    logger.error('SUPABASE_SERVICE_ROLE_KEY is not set — all DB writes will fail');
    process.exit(1);
  }
  try {
    const payload = JSON.parse(
      Buffer.from(serviceKey.split('.')[1], 'base64url').toString('utf8')
    );
    if (payload.role !== 'service_role') {
      logger.error(
        { role: payload.role },
        `FATAL: SUPABASE_SERVICE_ROLE_KEY has role="${payload.role}" — must be "service_role". ` +
        'All DB writes will fail with RLS errors. Update this key in your environment variables.'
      );
      process.exit(1);
    }
    logger.info({ role: payload.role }, '[ENV] Supabase service role key OK');
  } catch {
    logger.warn('[ENV] Could not decode SUPABASE_SERVICE_ROLE_KEY JWT — proceeding anyway');
  }

  if (!process.env.SUPABASE_URL) {
    logger.error('SUPABASE_URL is not set');
    process.exit(1);
  }
}

validateEnv();

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['*'];

const fastify = Fastify({
  logger: false,
  bodyLimit: 1048576,
});

async function bootstrap() {
  await fastify.register(cors, {
    origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
  });

  await fastify.register(processRoutes);

  fastify.setErrorHandler((error, request, reply) => {
    logger.error({ err: error.message, url: request.url }, 'Unhandled error');
    reply.status(error.statusCode || 500).send({
      success: false,
      error: error.message,
      code: 'SERVER_ERROR',
    });
  });

  await fastify.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, `Processing server running`);
}

bootstrap().catch((err) => {
  logger.error({ err: err.message }, 'Fatal startup error');
  process.exit(1);
});
