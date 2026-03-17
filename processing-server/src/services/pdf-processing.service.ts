import { ProcessingResult, SectionOutput, PageOutput } from '../types/index.js';
import { logger } from '../utils/logger.js';

function sanitizeText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\x00/g, '').trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPageHtml(pageNum: number, totalPages: number, text: string): string {
  const escaped = escapeHtml(sanitizeText(text));
  return `<div style="direction:rtl;font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:8px 0;">
  <div style="border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;">
    <h2 style="font-size:22px;font-weight:700;color:#0f172a;margin:0;">עמוד ${pageNum}</h2>
    <span style="font-size:13px;color:#94a3b8;">${pageNum} / ${totalPages}</span>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <p style="font-size:16px;line-height:1.8;color:#1e293b;white-space:pre-wrap;margin:0;">${escaped}</p>
  </div>
</div>`;
}

export async function processPdf(
  buffer: Buffer,
  assetId: string,
  originalName: string,
  onProgress?: (message: string) => void,
  storagePath?: string
): Promise<ProcessingResult> {
  const log = (msg: string) => {
    logger.info({ assetId, msg }, '[PDF]');
    onProgress?.(msg);
  };

  log(`מעבד PDF: ${originalName}`);

  let pageTexts: string[] = [];
  let pageCount = 1;

  try {
    const pdfParse = await import('pdf-parse');
    const data = await pdfParse.default(buffer);
    pageCount = data.numpages || 1;

    const rawText = data.text || '';

    // Strategy 1: form-feed characters (one per PDF page in text-based PDFs)
    const ffSplit = rawText
      .split(/\f/)
      .map((s: string) => s.replace(/\n{3,}/g, '\n\n').trim())
      .filter((s: string) => s.length > 10);

    if (ffSplit.length >= 2) {
      pageTexts = ffSplit;
    } else {
      // Strategy 2: double-newline paragraph split
      const paraChunks = rawText.split(/\n{2,}/).map((s: string) => s.trim()).filter((s: string) => s.length > 20);
      if (paraChunks.length >= 2) {
        pageTexts = paraChunks;
      } else if (rawText.trim().length > 0) {
        // Strategy 3: no structural separators — split proportionally by actual page count
        // This handles PDFs where all text comes as one blob (common with scanned/vector PDFs)
        const charsPerPage = Math.ceil(rawText.length / pageCount);
        const proportional: string[] = [];
        for (let i = 0; i < pageCount; i++) {
          const chunk = rawText.slice(i * charsPerPage, (i + 1) * charsPerPage).trim();
          if (chunk.length > 0) proportional.push(chunk);
        }
        pageTexts = proportional.length > 0 ? proportional : [rawText.trim()];
      } else {
        pageTexts = [`תוכן מקובץ ${originalName}`];
      }
    }

    log(`חולצו ${pageTexts.length} מקטעים מ-${pageCount} עמודים`);
  } catch (err: any) {
    logger.warn({ assetId, err: err.message }, '[PDF] Parse failed, using placeholder');
    log(`לא ניתן לחלץ טקסט מ-${originalName}, יוצר דפים בסיסיים`);
    pageTexts = Array.from(
      { length: pageCount },
      (_, i) => `עמוד ${i + 1} מתוך ${pageCount} - ${originalName}`
    );
  }

  const totalPages = pageTexts.length;

  const section: SectionOutput = {
    title: originalName.replace(/\.[^.]+$/, ''),
    orderIndex: 0,
    assetId,
    metadata: { pageCount: totalPages, source: 'pdf' },
  };

  const pages: PageOutput[] = pageTexts.map((text, idx) => ({
    sectionIndex: 0,
    orderIndex: idx,
    pageType: 'pdf',
    title: `עמוד ${idx + 1}`,
    htmlContent: buildPageHtml(idx + 1, totalPages, text),
    assetId,
    pdfPageNum: idx + 1,
    // storagePath enables PdfPageViewer (pdf.js) in the browser — shows the real PDF page
    // including all images, diagrams, and formatting from the original file.
    videoStoragePath: storagePath,
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
