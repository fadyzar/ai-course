"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideo = processVideo;
const logger_js_1 = require("../utils/logger.js");
function sanitizeText(text) {
    return text.replace(/\u0000/g, '').replace(/\x00/g, '').trim();
}
async function processVideo(storagePath, assetId, originalName, onProgress) {
    const log = (msg) => {
        logger_js_1.logger.info({ assetId, msg }, '[VIDEO]');
        onProgress?.(msg);
    };
    log(`מעבד סרטון: ${originalName}`);
    const title = sanitizeText(originalName.replace(/\.[^.]+$/, ''));
    const section = {
        title,
        orderIndex: 0,
        assetId,
        sourceSlideId: `video_asset_${assetId}`,
        metadata: { source: 'video' },
    };
    const page = {
        sectionIndex: 0,
        orderIndex: 0,
        pageType: 'video',
        title,
        htmlContent: '',
        assetId,
        videoStoragePath: storagePath,
        sourceRefs: { assetId, originalName },
    };
    log(`הושלם: 1 פרק, 1 עמוד סרטון`);
    return {
        sections: [section],
        pages: [page],
        questions: [],
        derivedAssets: [],
    };
}
