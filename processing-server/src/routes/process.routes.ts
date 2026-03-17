import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  handleProcessAsset,
  handleProcessJob,
  handleProcessJobSync,
} from '../controllers/process.controller.js';
import { ProcessAssetRequest, ProcessJobRequest } from '../types/index.js';

async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = process.env.PROCESSING_SERVER_API_KEY;
  if (!apiKey) return; // No key configured = open (dev mode)

  const provided =
    request.headers['x-api-key'] ||
    (request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : null);

  if (!provided || provided !== apiKey) {
    reply.status(401).send({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

export async function processRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', verifyApiKey);

  fastify.post<{ Body: ProcessAssetRequest }>(
    '/process-asset',
    {
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
    },
    handleProcessAsset
  );

  fastify.post<{ Body: ProcessJobRequest }>(
    '/process-job',
    {
      schema: {
        body: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string' },
          },
        },
      },
    },
    handleProcessJob
  );

  fastify.post<{ Body: ProcessJobRequest }>(
    '/process-job-sync',
    {
      schema: {
        body: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string' },
          },
        },
      },
    },
    handleProcessJobSync
  );

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));
}
