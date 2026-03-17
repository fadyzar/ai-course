"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAsset = processAsset;
exports.processJobById = processJobById;
const file_detector_js_1 = require("../utils/file-detector.js");
const pptx_processing_service_js_1 = require("./pptx-processing.service.js");
const pdf_processing_service_js_1 = require("./pdf-processing.service.js");
const docx_processing_service_js_1 = require("./docx-processing.service.js");
const video_processing_service_js_1 = require("./video-processing.service.js");
const course_write_service_js_1 = require("./course-write.service.js");
const logger_js_1 = require("../utils/logger.js");
async function downloadAsset(supabase, storagePath) {
    const { data, error } = await supabase.storage
        .from('course-assets')
        .download(storagePath);
    if (error || !data) {
        throw new Error(`Storage download failed: ${error?.message || 'no data'}`);
    }
    // Stream to buffer instead of arrayBuffer() which can OOM on large files
    const reader = data.stream().getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        chunks.push(value);
        totalBytes += value.byteLength;
    }
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return Buffer.from(merged);
}
async function processAsset(supabase, opts) {
    const { assetId, courseId, jobId } = opts;
    logger_js_1.logger.info({ assetId, courseId, jobId }, '[ORCHESTRATOR] Starting asset processing');
    const { data: asset, error: assetError } = await supabase
        .from('course_assets')
        .select('*')
        .eq('id', assetId)
        .maybeSingle();
    if (assetError || !asset) {
        throw new Error(`Asset not found: ${assetError?.message || 'not found'}`);
    }
    const assetRecord = asset;
    await supabase
        .from('course_assets')
        .update({ status: 'processing' })
        .eq('id', assetId);
    const category = (0, file_detector_js_1.detectFileCategory)(assetRecord.file_type);
    logger_js_1.logger.info({ assetId, fileType: assetRecord.file_type, category }, '[ORCHESTRATOR] File category detected');
    let result;
    const onProgress = (message) => {
        logger_js_1.logger.info({ assetId, message }, '[PROGRESS]');
    };
    if (category === 'video') {
        result = await (0, video_processing_service_js_1.processVideo)(assetRecord.storage_path, assetId, assetRecord.original_name, onProgress);
    }
    else {
        const buffer = await downloadAsset(supabase, assetRecord.storage_path);
        logger_js_1.logger.info({ assetId, sizeBytes: buffer.length }, '[ORCHESTRATOR] File downloaded');
        if (category === 'pptx') {
            result = await (0, pptx_processing_service_js_1.processPptx)(buffer, assetId, assetRecord.original_name, supabase, onProgress);
        }
        else if (category === 'pdf') {
            result = await (0, pdf_processing_service_js_1.processPdf)(buffer, assetId, assetRecord.original_name, onProgress);
        }
        else if (category === 'docx') {
            result = await (0, docx_processing_service_js_1.processDocx)(buffer, assetId, assetRecord.original_name, onProgress);
        }
        else {
            throw new Error(`Unsupported file type: ${assetRecord.file_type}`);
        }
    }
    logger_js_1.logger.info({
        assetId,
        sections: result.sections.length,
        pages: result.pages.length,
        questions: result.questions.length,
    }, '[ORCHESTRATOR] Processing complete, writing to Supabase');
    await (0, course_write_service_js_1.writeCourse)(supabase, result, {
        courseId,
        assetId,
        jobId,
        clearExisting: opts.clearExisting ?? true,
    });
    return result;
}
async function processJobById(supabase, jobId) {
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
    let result;
    try {
        if (job.asset_id) {
            result = await processAsset(supabase, {
                assetId: job.asset_id,
                courseId: job.course_id,
                jobId,
                clearExisting: true,
            });
        }
        else {
            const { data: assets } = await supabase
                .from('course_assets')
                .select('*')
                .eq('course_id', job.course_id)
                .order('created_at', { ascending: true });
            if (!assets || assets.length === 0) {
                throw new Error('No assets found for course');
            }
            const combinedResult = {
                sections: [],
                pages: [],
                questions: [],
                derivedAssets: [],
            };
            let sectionOffset = 0;
            let pageOffset = 0;
            const VIDEO_TYPES = new Set(['mp4', 'mpeg', 'mov', 'avi', 'webm', 'mkv', 'm4v']);
            for (const asset of assets) {
                const assetRecord = asset;
                const fileType = (assetRecord.file_type || '').toLowerCase();
                const category = (0, file_detector_js_1.detectFileCategory)(fileType);
                await supabase
                    .from('course_assets')
                    .update({ status: 'processing' })
                    .eq('id', asset.id);
                let assetResult;
                if (category === 'video' || VIDEO_TYPES.has(fileType)) {
                    logger_js_1.logger.info({ assetId: asset.id }, '[ORCHESTRATOR] Processing video asset');
                    assetResult = await (0, video_processing_service_js_1.processVideo)(assetRecord.storage_path, asset.id, assetRecord.original_name, (msg) => logger_js_1.logger.info({ msg }, '[PROGRESS]'));
                }
                else {
                    const buffer = await downloadAsset(supabase, assetRecord.storage_path);
                    if (category === 'pptx') {
                        assetResult = await (0, pptx_processing_service_js_1.processPptx)(buffer, asset.id, assetRecord.original_name, supabase, (msg) => logger_js_1.logger.info({ msg }, '[PROGRESS]'));
                    }
                    else if (category === 'pdf') {
                        assetResult = await (0, pdf_processing_service_js_1.processPdf)(buffer, asset.id, assetRecord.original_name, (msg) => logger_js_1.logger.info({ msg }, '[PROGRESS]'));
                    }
                    else if (category === 'docx') {
                        assetResult = await (0, docx_processing_service_js_1.processDocx)(buffer, asset.id, assetRecord.original_name, (msg) => logger_js_1.logger.info({ msg }, '[PROGRESS]'));
                    }
                    else {
                        logger_js_1.logger.warn({ assetId: asset.id, fileType }, '[ORCHESTRATOR] Unsupported file type, skipping');
                        continue;
                    }
                }
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
                await supabase
                    .from('course_assets')
                    .update({ status: 'processed' })
                    .eq('id', asset.id);
            }
            await (0, course_write_service_js_1.writeCourse)(supabase, combinedResult, {
                courseId: job.course_id,
                jobId,
                clearExisting: true,
            });
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
    }
    catch (err) {
        logger_js_1.logger.error({ jobId, err: err.message }, '[ORCHESTRATOR] Job failed');
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
