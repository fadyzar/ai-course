"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleProcessAsset = handleProcessAsset;
exports.handleProcessJob = handleProcessJob;
exports.handleProcessJobSync = handleProcessJobSync;
const supabase_js_1 = require("../utils/supabase.js");
const asset_processing_service_js_1 = require("../services/asset-processing.service.js");
const logger_js_1 = require("../utils/logger.js");
async function handleProcessAsset(request, reply) {
    const { assetId, courseId } = request.body;
    if (!assetId || !courseId) {
        return reply.status(400).send({
            success: false,
            error: 'assetId and courseId are required',
            code: 'MISSING_PARAMS',
        });
    }
    logger_js_1.logger.info({ assetId, courseId }, '[CONTROLLER] process-asset request');
    try {
        const supabase = (0, supabase_js_1.getAdminClient)();
        const result = await (0, asset_processing_service_js_1.processAsset)(supabase, { assetId, courseId });
        return {
            success: true,
            assetId,
            courseId,
            sections: result.sections.length,
            pages: result.pages.length,
            questions: result.questions.length,
        };
    }
    catch (err) {
        logger_js_1.logger.error({ assetId, courseId, err: err.message }, '[CONTROLLER] process-asset failed');
        return reply.status(500).send({
            success: false,
            error: err.message,
            code: 'PROCESSING_FAILED',
        });
    }
}
async function handleProcessJob(request, reply) {
    const { jobId } = request.body;
    if (!jobId) {
        return reply.status(400).send({
            success: false,
            error: 'jobId is required',
            code: 'MISSING_PARAMS',
        });
    }
    logger_js_1.logger.info({ jobId }, '[CONTROLLER] process-job request');
    reply.status(202).send({ success: true, accepted: true, jobId });
    setImmediate(async () => {
        try {
            const supabase = (0, supabase_js_1.getAdminClient)();
            await (0, asset_processing_service_js_1.processJobById)(supabase, jobId);
            logger_js_1.logger.info({ jobId }, '[CONTROLLER] Background job completed');
        }
        catch (err) {
            logger_js_1.logger.error({ jobId, err: err.message }, '[CONTROLLER] Background job failed');
        }
    });
    return { success: true, jobId };
}
async function handleProcessJobSync(request, reply) {
    const { jobId } = request.body;
    if (!jobId) {
        return reply.status(400).send({
            success: false,
            error: 'jobId is required',
            code: 'MISSING_PARAMS',
        });
    }
    logger_js_1.logger.info({ jobId }, '[CONTROLLER] process-job-sync request');
    try {
        const supabase = (0, supabase_js_1.getAdminClient)();
        const result = await (0, asset_processing_service_js_1.processJobById)(supabase, jobId);
        return {
            success: true,
            jobId,
            sections: result.sections.length,
            pages: result.pages.length,
            questions: result.questions.length,
        };
    }
    catch (err) {
        logger_js_1.logger.error({ jobId, err: err.message }, '[CONTROLLER] process-job-sync failed');
        return reply.status(500).send({
            success: false,
            error: err.message,
            code: 'PROCESSING_FAILED',
        });
    }
}
