import { SupabaseClient } from '@supabase/supabase-js';
import {
  ProcessingResult,
  SectionOutput,
  PageOutput,
  QuestionOutput,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface WriteOptions {
  courseId: string;
  assetId?: string;
  jobId?: string;
  clearExisting?: boolean;
}

async function logProgress(
  supabase: SupabaseClient,
  jobId: string | undefined,
  level: string,
  message: string,
  progress: number,
  meta: Record<string, unknown> = {}
) {
  if (!jobId) return;
  try {
    await supabase.from('processing_logs').insert({
      job_id: jobId,
      level,
      message,
      meta: { ...meta, progress },
    });
    await supabase
      .from('jobs')
      .update({
        progress,
        metadata: { current_step: message, ...meta },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Log progress failed');
  }
}

export async function writeCourse(
  supabase: SupabaseClient,
  result: ProcessingResult,
  opts: WriteOptions
): Promise<{ sectionIds: string[]; pageIds: string[] }> {
  const { courseId, assetId, jobId, clearExisting = true } = opts;

  logger.info({ courseId, assetId }, '[WRITE] Starting course write');

  if (clearExisting) {
    const { data: existingSections } = await supabase
      .from('course_sections')
      .select('id')
      .eq('course_id', courseId);

    if (existingSections && existingSections.length > 0) {
      for (const section of existingSections) {
        await supabase.from('course_pages').delete().eq('section_id', section.id);
      }
      await supabase.from('course_sections').delete().eq('course_id', courseId);
    }
    await supabase.from('questions').delete().eq('course_id', courseId);
  }

  await logProgress(supabase, jobId, 'info', 'שומר פרקים...', 88);

  const sectionInserts = result.sections.map((s: SectionOutput) => ({
    course_id: courseId,
    title: s.title,
    order_index: s.orderIndex,
    source_slide_id: s.sourceSlideId || null,
    asset_id: s.assetId || assetId || null,
    metadata: s.metadata || {},
  }));

  const { data: insertedSections, error: sectionsError } = await supabase
    .from('course_sections')
    .insert(sectionInserts)
    .select();

  if (sectionsError) {
    throw new Error(`Failed to insert sections: ${sectionsError.message}`);
  }

  const sectionIds = (insertedSections || []).map((s: any) => s.id);
  logger.info({ count: sectionIds.length }, '[WRITE] Sections inserted');

  await logProgress(supabase, jobId, 'info', 'שומר עמודים...', 90);

  const PAGE_BATCH = 50;
  const allPageIds: string[] = [];

  for (let i = 0; i < result.pages.length; i += PAGE_BATCH) {
    const batch = result.pages.slice(i, i + PAGE_BATCH);

    const pageInserts = batch.map((p: PageOutput) => {
      const sectionId = sectionIds[p.sectionIndex] || null;
      return {
        course_id: courseId,
        section_id: sectionId,
        order_index: p.orderIndex,
        page_type: p.pageType,
        title: p.title || null,
        html_content: p.htmlContent,
        asset_id: p.assetId || assetId || null,
        video_storage_path: p.videoStoragePath || null,
        pdf_page_num: p.pdfPageNum || null,
        slide_index: p.slideIndex || null,
        source_refs: p.sourceRefs || {},
      };
    });

    const { data: insertedPages, error: pagesError } = await supabase
      .from('course_pages')
      .insert(pageInserts)
      .select('id');

    if (pagesError) {
      logger.error({ err: pagesError.message }, '[WRITE] Pages insert error');
      throw new Error(`Failed to insert pages: ${pagesError.message}`);
    }

    for (const p of insertedPages || []) allPageIds.push(p.id);

    const progress = Math.round(90 + ((i + PAGE_BATCH) / result.pages.length) * 8);
    await logProgress(
      supabase,
      jobId,
      'info',
      `נשמרו ${Math.min(i + PAGE_BATCH, result.pages.length)}/${result.pages.length} עמודים`,
      Math.min(progress, 98)
    );
  }

  logger.info({ count: allPageIds.length }, '[WRITE] Pages inserted');

  if (result.questions.length > 0) {
    await logProgress(supabase, jobId, 'info', 'שומר שאלות...', 98);

    const questionInserts = result.questions
      .map((q: QuestionOutput) => {
        const pageId = allPageIds[q.pageIndex] || null;
        if (!pageId) return null;
        return {
          course_id: courseId,
          page_id: pageId,
          type: q.type,
          prompt: q.prompt,
          options: q.options,
          correct_answer: q.correctAnswer,
          confidence: q.confidence,
          reviewed_by_teacher: false,
        };
      })
      .filter(Boolean);

    if (questionInserts.length > 0) {
      const { error: questionsError } = await supabase
        .from('questions')
        .insert(questionInserts);

      if (questionsError) {
        logger.warn({ err: questionsError.message }, '[WRITE] Questions insert warning');
      } else {
        logger.info({ count: questionInserts.length }, '[WRITE] Questions inserted');
      }
    }
  }

  await supabase
    .from('courses')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', courseId);

  if (assetId) {
    await supabase
      .from('course_assets')
      .update({ status: 'processed' })
      .eq('id', assetId);
  }

  if (result.derivedAssets && result.derivedAssets.length > 0) {
    const derivedInserts = result.derivedAssets.map((da) => ({
      course_id: courseId,
      file_type: da.mimeType.split('/')[1] || 'mp4',
      storage_path: da.storagePath,
      original_name: da.originalName,
      size_bytes: da.sizeBytes,
      status: 'processed',
      metadata: { sourceSlideIndex: da.sourceSlideIndex, extracted: true },
    }));

    const { error: derivedError } = await supabase
      .from('course_assets')
      .insert(derivedInserts);

    if (derivedError) {
      logger.warn({ err: derivedError.message }, '[WRITE] Derived assets insert warning');
    } else {
      logger.info({ count: derivedInserts.length }, '[WRITE] Derived assets inserted');
    }
  }

  await logProgress(supabase, jobId, 'info', 'הקורס מוכן!', 100);

  logger.info({ courseId, sections: sectionIds.length, pages: allPageIds.length }, '[WRITE] Done');

  return { sectionIds, pageIds: allPageIds };
}
