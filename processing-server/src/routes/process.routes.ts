import { FastifyInstance } from 'fastify';
import {
  handleProcessAsset,
  handleProcessJob,
  handleProcessJobSync,
} from '../controllers/process.controller.js';
import { ProcessAssetRequest, ProcessJobRequest } from '../types/index.js';

export async function processRoutes(fastify: FastifyInstance) {
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
