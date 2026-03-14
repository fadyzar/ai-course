import { SupabaseClient } from '@supabase/supabase-js';
import { ProcessingResult, AssetRecord } from '../types/index.js';
import { detectFileCategory } from '../utils/file-detector.js';
import { processPptx } from './pptx-processing.service.js';
import { processPdf } from './pdf-processing.service.js';
import { processDocx } from './docx-processing.service.js';
import { processVideo } from './video-processing.service.js';
import { writeCourse } from './course-write.service.js';
import { logger } from '../utils/logger.js';

export interface ProcessAssetOptions {
  assetId: string;
  courseId: string;
  jobId?: string;
  clearExisting?: boolean;
}

async function downloadAsset(
  supabase: SupabaseClient,
  storagePath: string
): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from('course-assets')
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message || 'no data'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function processAsset(
  supabase: SupabaseClient,
  opts: ProcessAssetOptions
): Promise<ProcessingResult> {
  const { assetId, courseId, jobId } = opts;

  logger.info({ assetId, courseId, jobId }, '[ORCHESTRATOR] Starting asset processing');

  const { data: asset, error: assetError } = await supabase
    .from('course_assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle();

  if (assetError || !asset) {
    throw new Error(`Asset not found: ${assetError?.message || 'not found'}`);
  }

  const assetRecord = asset as AssetRecord;

  await supabase
    .from('course_assets')
    .update({ status: 'processing' })
    .eq('id', assetId);

  const category = detectFileCategory(assetRecord.file_type);
  logger.info({ assetId, fileType: assetRecord.file_type, category }, '[ORCHESTRATOR] File category detected');

  let result: ProcessingResult;

  const onProgress = (message: string) => {
    logger.info({ assetId, message }, '[PROGRESS]');
  };

  if (category === 'video') {
    result = await processVideo(
      assetRecord.storage_path,
      assetId,
      assetRecord.original_name,
      onProgress
    );
  } else {
    const buffer = await downloadAsset(supabase, assetRecord.storage_path);
    logger.info({ assetId, sizeBytes: buffer.length }, '[ORCHESTRATOR] File downloaded');

    if (category === 'pptx') {
      result = await processPptx(buffer, assetId, assetRecord.original_name, onProgress);
    } else if (category === 'pdf') {
      result = await processPdf(buffer, assetId, assetRecord.original_name, onProgress);
    } else if (category === 'docx') {
      result = await processDocx(buffer, assetId, assetRecord.original_name, onProgress);
    } else {
      throw new Error(`Unsupported file type: ${assetRecord.file_type}`);
    }
  }

  logger.info(
    {
      assetId,
      sections: result.sections.length,
      pages: result.pages.length,
      questions: result.questions.length,
    },
    '[ORCHESTRATOR] Processing complete, writing to Supabase'
  );

  await writeCourse(supabase, result, {
    courseId,
    assetId,
    jobId,
    clearExisting: opts.clearExisting ?? true,
  });

  return result;
}

export async function processJobById(
  supabase: SupabaseClient,
  jobId: string
): Promise<ProcessingResult> {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) {
    throw new Error(`Job not found: ${jobError?.message || 'not found'}`);
  }

  if (job.status !== 'queued' && job.status !== 'processing') {
    throw new Error(`Job ${jobId} is in status '${job.status}', cannot process`);
  }

  await supabase
    .from('jobs')
    .update({ status: 'processing', progress: 5, updated_at: new Date().toISOString() })
    .eq('id', jobId);

  await supabase.from('processing_logs').insert({
    job_id: jobId,
    level: 'info',
    message: 'מתחיל עיבוד בשרת עיבוד ייעודי...',
    meta: { progress: 5 },
  });

  await supabase
    .from('courses')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', job.course_id);

  let result: ProcessingResult;

  try {
    if (job.asset_id) {
      result = await processAsset(supabase, {
        assetId: job.asset_id,
        courseId: job.course_id,
        jobId,
        clearExisting: true,
      });
    } else {
      const { data: assets } = await supabase
        .from('course_assets')
        .select('*')
        .eq('course_id', job.course_id)
        .order('created_at', { ascending: true });

      if (!assets || assets.length === 0) {
        throw new Error('No assets found for course');
      }

      const combinedResult: ProcessingResult = {
        sections: [],
        pages: [],
        questions: [],
        derivedAssets: [],
      };

      let sectionOffset = 0;
      let pageOffset = 0;

      for (const asset of assets) {
        const assetResult = await processAsset(supabase, {
          assetId: asset.id,
          courseId: job.course_id,
          jobId,
          clearExisting: false,
        });

        const adjustedSections = assetResult.sections.map((s) => ({
          ...s,
          orderIndex: s.orderIndex + sectionOffset,
        }));

        const adjustedPages = assetResult.pages.map((p) => ({
          ...p,
          sectionIndex: p.sectionIndex + sectionOffset,
          orderIndex: p.orderIndex + pageOffset,
        }));

        const adjustedQuestions = assetResult.questions.map((q) => ({
          ...q,
          pageIndex: q.pageIndex + pageOffset,
        }));

        combinedResult.sections.push(...adjustedSections);
        combinedResult.pages.push(...adjustedPages);
        combinedResult.questions.push(...adjustedQuestions);
        combinedResult.derivedAssets.push(...assetResult.derivedAssets);

        sectionOffset += assetResult.sections.length;
        pageOffset += assetResult.pages.length;
      }

      result = combinedResult;
    }

    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        progress: 100,
        metadata: { current_step: 'הושלם בהצלחה!' },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    await supabase.from('processing_logs').insert({
      job_id: jobId,
      level: 'info',
      message: `הושלם: ${result.sections.length} פרקים, ${result.pages.length} עמודים, ${result.questions.length} שאלות`,
      meta: { progress: 100 },
    });
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, '[ORCHESTRATOR] Job failed');

    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error: err.message,
        metadata: { current_step: `נכשל: ${err.message}` },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    await supabase
      .from('courses')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', job.course_id);

    await supabase.from('processing_logs').insert({
      job_id: jobId,
      level: 'error',
      message: `נכשל: ${err.message}`,
      meta: {},
    });

    throw err;
  }

  return result;
}
