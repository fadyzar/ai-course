import { FastifyRequest, FastifyReply } from 'fastify';
import { getAdminClient } from '../utils/supabase.js';
import { processAsset, processJobById } from '../services/asset-processing.service.js';
import { ProcessAssetRequest, ProcessJobRequest, ProcessingResponse } from '../types/index.js';
import { logger } from '../utils/logger.js';

export async function handleProcessAsset(
  request: FastifyRequest<{ Body: ProcessAssetRequest }>,
  reply: FastifyReply
): Promise<ProcessingResponse> {
  const { assetId, courseId } = request.body;

  if (!assetId || !courseId) {
    return reply.status(400).send({
      success: false,
      error: 'assetId and courseId are required',
      code: 'MISSING_PARAMS',
    });
  }

  logger.info({ assetId, courseId }, '[CONTROLLER] process-asset request received');

  try {
    const supabase = getAdminClient();

    logger.info({ assetId }, '[CONTROLLER] testing DB connectivity - querying course_assets');
    const { data: testData, error: testError } = await supabase
      .from('course_assets')
      .select('id, file_type, status, course_id')
      .eq('id', assetId)
      .maybeSingle();
    logger.info(
      { assetId, found: !!testData, testError: testError?.message, row: testData },
      '[CONTROLLER] DB probe result'
    );

    const result = await processAsset(supabase, { assetId, courseId });

    return {
      success: true,
      assetId,
      courseId,
      sections: result.sections.length,
      pages: result.pages.length,
      questions: result.questions.length,
    };
  } catch (err: any) {
    logger.error({ assetId, courseId, err: err.message, stack: err.stack }, '[CONTROLLER] process-asset failed');
    return reply.status(500).send({
      success: false,
      error: err.message,
      code: 'PROCESSING_FAILED',
      debug: { assetId, courseId },
    });
  }
}

export async function handleProcessJob(
  request: FastifyRequest<{ Body: ProcessJobRequest }>,
  reply: FastifyReply
): Promise<ProcessingResponse> {
  const { jobId } = request.body;

  if (!jobId) {
    return reply.status(400).send({
      success: false,
      error: 'jobId is required',
      code: 'MISSING_PARAMS',
    });
  }

  logger.info({ jobId }, '[CONTROLLER] process-job request');

  reply.status(202).send({ success: true, accepted: true, jobId });

  setImmediate(async () => {
    try {
      const supabase = getAdminClient();
      await processJobById(supabase, jobId);
      logger.info({ jobId }, '[CONTROLLER] Background job completed');
    } catch (err: any) {
      logger.error({ jobId, err: err.message }, '[CONTROLLER] Background job failed');
    }
  });

  return { success: true, jobId };
}

export async function handleProcessJobSync(
  request: FastifyRequest<{ Body: ProcessJobRequest }>,
  reply: FastifyReply
): Promise<ProcessingResponse> {
  const { jobId } = request.body;

  if (!jobId) {
    return reply.status(400).send({
      success: false,
      error: 'jobId is required',
      code: 'MISSING_PARAMS',
    });
  }

  logger.info({ jobId }, '[CONTROLLER] process-job-sync request');

  try {
    const supabase = getAdminClient();
    const result = await processJobById(supabase, jobId);

    return {
      success: true,
      jobId,
      sections: result.sections.length,
      pages: result.pages.length,
      questions: result.questions.length,
    };
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, '[CONTROLLER] process-job-sync failed');
    return reply.status(500).send({
      success: false,
      error: err.message,
      code: 'PROCESSING_FAILED',
    });
  }
}
