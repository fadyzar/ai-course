"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPdf = processPdf;
const logger_js_1 = require("../utils/logger.js");
function sanitizeText(text) {
    return text.replace(/\u0000/g, '').replace(/\x00/g, '').trim();
}
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function buildPageHtml(pageNum, totalPages, text) {
    const escaped = escapeHtml(sanitizeText(text));
    return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="border-b border-slate-200 pb-3">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold text-slate-900">עמוד ${pageNum}</h2>
      <span class="text-sm text-slate-400">עמוד ${pageNum} מתוך ${totalPages}</span>
    </div>
  </div>
  <div class="bg-slate-50 p-6 rounded-xl border border-slate-200">
    <p class="text-slate-800 leading-relaxed whitespace-pre-wrap text-base">${escaped}</p>
  </div>
</div>`;
}
async function processPdf(buffer, assetId, originalName, onProgress) {
    const log = (msg) => {
        logger_js_1.logger.info({ assetId, msg }, '[PDF]');
        onProgress?.(msg);
    };
    log(`מעבד PDF: ${originalName}`);
    let pageTexts = [];
    let pageCount = 1;
    try {
        const pdfParse = await Promise.resolve().then(() => __importStar(require('pdf-parse')));
        const data = await pdfParse.default(buffer);
        pageCount = data.numpages || 1;
        const rawText = data.text || '';
        const sections = rawText
            .split(/\f/)
            .map((s) => s.replace(/\n{3,}/g, '\n\n').trim())
            .filter((s) => s.length > 10);
        if (sections.length > 0) {
            pageTexts = sections;
        }
        else {
            const chunks = rawText.split(/\n\n+/).filter((s) => s.trim().length > 20);
            pageTexts = chunks.length > 0 ? chunks : [`תוכן מקובץ ${originalName}`];
        }
        log(`חולצו ${pageTexts.length} מקטעים מ-${pageCount} עמודים`);
    }
    catch (err) {
        logger_js_1.logger.warn({ assetId, err: err.message }, '[PDF] Parse failed, using placeholder');
        log(`לא ניתן לחלץ טקסט מ-${originalName}, יוצר דפים בסיסיים`);
        pageTexts = Array.from({ length: pageCount }, (_, i) => `עמוד ${i + 1} מתוך ${pageCount} - ${originalName}`);
    }
    const totalPages = pageTexts.length;
    const section = {
        title: originalName.replace(/\.[^.]+$/, ''),
        orderIndex: 0,
        assetId,
        metadata: { pageCount: totalPages, source: 'pdf' },
    };
    const pages = pageTexts.map((text, idx) => ({
        sectionIndex: 0,
        orderIndex: idx,
        pageType: 'pdf',
        title: `עמוד ${idx + 1}`,
        htmlContent: buildPageHtml(idx + 1, totalPages, text),
        assetId,
        pdfPageNum: idx + 1,
        sourceRefs: { pageNumber: idx + 1, ai: false },
    }));
    log(`הושלם: 1 פרק, ${pages.length} עמודים`);
    return {
        sections: [section],
        pages,
        questions: [],
        derivedAssets: [],
    };
}
