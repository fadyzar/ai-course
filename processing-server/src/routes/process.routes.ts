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

  fastify.get('/db-check', async (_req, reply) => {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    const envStatus = {
      hasSupabaseUrl: !!url,
      supabaseUrlPrefix: url?.substring(0, 40),
      hasServiceRoleKey: !!serviceKey,
      serviceKeyPrefix: serviceKey ? serviceKey.substring(0, 12) + '...' : null,
      hasAnonKey: !!anonKey,
    };

    if (!url || !serviceKey) {
      return reply.status(500).send({ ok: false, reason: 'missing_env', envStatus });
    }

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

      const { count, error } = await client
        .from('course_assets')
        .select('*', { count: 'exact', head: true });

      return {
        ok: !error,
        rowCount: count,
        error: error?.message,
        errorCode: error?.code,
        envStatus,
      };
    } catch (err: any) {
      return reply.status(500).send({ ok: false, reason: err.message, envStatus });
    }
  });
}
