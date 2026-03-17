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

export async function processDocx(
  buffer: Buffer,
  assetId: string,
  originalName: string,
  onProgress?: (message: string) => void
): Promise<ProcessingResult> {
  const log = (msg: string) => {
    logger.info({ assetId, msg }, '[DOCX]');
    onProgress?.(msg);
  };

  log(`מעבד DOCX: ${originalName}`);

  let chunks: string[] = [];

  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || '';

    if (text.trim().length > 20) {
      const sections = text
        .split(/\n\n+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 20);

      if (sections.length > 0) {
        chunks = sections;
      } else {
        const words = text.split(/\s+/);
        for (let i = 0; i < words.length; i += 300) {
          const chunk = words.slice(i, i + 300).join(' ');
          if (chunk.trim().length > 20) chunks.push(chunk);
        }
      }
    }

    log(`חולצו ${chunks.length} מקטעים`);
  } catch (err: any) {
    logger.warn({ assetId, err: err.message }, '[DOCX] Parse failed');
    log(`לא ניתן לחלץ טקסט מ-${originalName}`);
  }

  if (chunks.length === 0) {
    chunks = [`תוכן מקובץ ${originalName}`];
  }

  const totalPages = chunks.length;

  const section: SectionOutput = {
    title: originalName.replace(/\.[^.]+$/, ''),
    orderIndex: 0,
    assetId,
    metadata: { pageCount: totalPages, source: 'docx' },
  };

  const pages: PageOutput[] = chunks.map((text, idx) => ({
    sectionIndex: 0,
    orderIndex: idx,
    pageType: 'text',
    title: `עמוד ${idx + 1}`,
    htmlContent: buildPageHtml(idx + 1, totalPages, text),
    assetId,
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
