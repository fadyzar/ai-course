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

export async function processPdf(
  buffer: Buffer,
  assetId: string,
  originalName: string,
  onProgress?: (message: string) => void
): Promise<ProcessingResult> {
  const log = (msg: string) => {
    logger.info({ assetId, msg }, '[PDF]');
    onProgress?.(msg);
  };

  log(`מעבד PDF: ${originalName}`);

  let pageTexts: string[] = [];
  let pageCount = 1;

  try {
    const pdfParse = await import('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse.default(buffer);
    pageCount = data.numpages || 1;

    const rawText = data.text || '';
    const sections = rawText
      .split(/\f/)
      .map((s: string) => s.replace(/\n{3,}/g, '\n\n').trim())
      .filter((s: string) => s.length > 10);

    if (sections.length > 0) {
      pageTexts = sections;
    } else {
      const chunks = rawText.split(/\n\n+/).filter((s: string) => s.trim().length > 20);
      pageTexts = chunks.length > 0 ? chunks : [`תוכן מקובץ ${originalName}`];
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
