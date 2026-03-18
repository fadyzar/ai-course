import * as unzipper from 'unzipper';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  ProcessingResult,
  SectionOutput,
  PageOutput,
  QuestionOutput,
  SlideData,
  SlideRelationship,
} from '../types/index.js';
import { enrichPagesBatch } from './ai-enrichment.service.js';
import { logger } from '../utils/logger.js';

const YOUTUBE_PATTERN = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/;
const VIMEO_PATTERN = /vimeo\.com\/(\d+)/;

// ─── Text helpers ─────────────────────────────────────────────────────────────

/** Build HTML for a single text run, preserving bold/italic/underline/highlight. */
function buildRunHtml(runXml: string): string {
  const textMatch = runXml.match(/<a:t(?:[^>]*)>([\s\S]*?)<\/a:t>/);
  if (!textMatch) return '';
  const rawText = textMatch[1].replace(/\u0000/g, '').replace(/\x00/g, '');
  if (!rawText) return '';

  // rPr may be self-closing (<a:rPr ... />) or have children (<a:rPr ...>...</a:rPr>)
  const rPrXml = runXml.match(/<a:rPr[\s\S]*?(?:<\/a:rPr>|\/>)/)?.[0] || '';

  const isBold      = /\bb="1"/.test(rPrXml)  || /<a:b(?:\s|\/|>)/.test(rPrXml);
  const isItalic    = /\bi="1"/.test(rPrXml)  || /<a:i(?:\s|\/|>)/.test(rPrXml);
  const isUnderline = /\bu="sng"/.test(rPrXml);

  // Yellow / any highlight: <a:highlight><a:srgbClr val="RRGGBB"/></a:highlight>
  const hlMatch = rPrXml.match(
    /<a:highlight>[\s\S]*?<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/
  );

  let span = escapeHtml(rawText);
  if (isBold)      span = `<strong>${span}</strong>`;
  if (isItalic)    span = `<em>${span}</em>`;
  if (isUnderline) span = `<u>${span}</u>`;
  if (hlMatch)     span = `<mark style="background:#${hlMatch[1]};padding:0 2px;border-radius:2px;">${span}</mark>`;

  return span;
}

/** Build HTML for a single <a:p> paragraph element. Returns '' for empty paragraphs. */
function buildParagraphHtml(pXml: string, baseStyle = ''): string {
  const runMatches = [...pXml.matchAll(/<a:r(?:\s[^>]*)?>[\s\S]*?<\/a:r>/g)];
  if (runMatches.length === 0) return '';

  const html = runMatches.map((m) => buildRunHtml(m[0])).join('');
  if (!html.trim()) return '';

  const lvlMatch = pXml.match(/\blvl="(\d+)"/);
  const level    = lvlMatch ? parseInt(lvlMatch[1]) : 0;
  const indent   = level > 0 ? `padding-right:${level * 16}px;` : '';

  return `<p style="margin:0 0 8px;line-height:1.8;font-size:15px;color:inherit;direction:rtl;${indent}${baseStyle}">${html}</p>`;
}

interface SlideContent {
  title: string;    // plain text from title/ctrTitle placeholder
  bodyHtml: string; // formatted HTML from body placeholder(s)
  plainText: string;// title + body as plain text (for isChapterSlide + AI)
}

/**
 * Parse a slide XML and extract:
 * - title  : text from the title/ctrTitle shape placeholder
 * - bodyHtml: formatted HTML (paragraphs, bold, italic, highlight) from body shapes
 * - plainText: merged plain text for downstream logic
 */
function extractSlideContent(xml: string): SlideContent {
  const titleParts: string[] = [];
  const bodyParas:  string[] = [];

  // Each <p:sp> is one shape; they don't nest in slide XML
  for (const spMatch of xml.matchAll(/<p:sp[\s>][\s\S]*?<\/p:sp>/g)) {
    const spXml = spMatch[0];

    const isTitle = /<p:ph\s[^>]*type="(?:title|ctrTitle)"/.test(spXml);

    const txBodyMatch = spXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/);
    if (!txBodyMatch) continue;

    const pMatches = [...txBodyMatch[1].matchAll(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g)];

    if (isTitle) {
      // Title: plain text only (no HTML formatting needed — rendered as <h2>)
      const titleText = pMatches
        .map((p) =>
          [...p[0].matchAll(/<a:t(?:[^>]*)>([\s\S]*?)<\/a:t>/g)]
            .map((t) => t[1].replace(/\u0000/g, '').replace(/\x00/g, ''))
            .join('')
        )
        .filter(Boolean)
        .join(' ')
        .trim();
      if (titleText) titleParts.push(titleText);
    } else {
      // Body: formatted HTML
      for (const pMatch of pMatches) {
        const paraHtml = buildParagraphHtml(pMatch[0]);
        if (paraHtml) bodyParas.push(paraHtml);
      }
    }
  }

  const title    = sanitizeText(titleParts.join(' '));
  const bodyHtml = bodyParas.join('');
  const bodyPlain = bodyParas
    .map((p) => p.replace(/<[^>]+>/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const plainText = sanitizeText([title, bodyPlain].filter(Boolean).join(' '));

  return { title, bodyHtml, plainText };
}

function extractExternalVideoUrl(xml: string): string | undefined {
  const youtubeMatch = xml.match(YOUTUBE_PATTERN);
  if (youtubeMatch) return `https://www.youtube.com/watch?v=${youtubeMatch[1]}`;
  const vimeoMatch = xml.match(VIMEO_PATTERN);
  if (vimeoMatch) return `https://vimeo.com/${vimeoMatch[1]}`;
  return undefined;
}

function isChapterSlide(text: string, hasMedia: boolean): boolean {
  if (hasMedia) return false;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length > 30) return false;
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  return lines.length <= 2 && words.length >= 2 && words.length <= 15;
}

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

function mimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    webm: 'video/webm', wmv: 'video/x-ms-wmv',
  };
  return map[ext] || 'application/octet-stream';
}

// ─── ZIP reading — uses unzipper to avoid loading full file into RAM ──────────

async function readZipEntries(filePath: string): Promise<Map<string, Buffer>> {
  const directory = await unzipper.Open.file(filePath);
  const entries = new Map<string, Buffer>();

  // Only load XML files (slides + rels) — these are tiny (KB not MB)
  // Media files are handled separately via streaming upload
  const xmlEntries = directory.files.filter(
    (f) =>
      f.path.match(/^ppt\/slides\/slide\d+\.xml$/) ||
      f.path.match(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/)
  );

  for (const entry of xmlEntries) {
    const buf = await entry.buffer();
    entries.set(entry.path, buf);
  }

  return entries;
}

async function uploadMediaEntry(
  filePath: string,
  zipEntryPath: string,
  supabase: SupabaseClient,
  storagePath: string,
  mimeType: string
): Promise<string | null> {
  try {
    const directory = await unzipper.Open.file(filePath);
    const entry = directory.files.find((f) => f.path === zipEntryPath);
    if (!entry) return null;

    // Buffer only this one entry (typically 50KB–2MB, not the whole 271MB)
    const bytes = await entry.buffer();

    const { error } = await supabase.storage
      .from('course-assets')
      .upload(storagePath, bytes, { contentType: mimeType, upsert: true });

    if (error) {
      logger.warn({ zipEntryPath, err: error.message }, '[PPTX] Media upload failed');
      return null;
    }

    const { data } = supabase.storage.from('course-assets').getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (err: any) {
    logger.warn({ zipEntryPath, err: err.message }, '[PPTX] Media upload error');
    return null;
  }
}

// ─── Relationship parsing ─────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'webm', 'wmv', 'm4v', 'mkv']);

function parseRelationships(relsXml: string): SlideRelationship[] {
  const relationships: SlideRelationship[] = [];
  const relMatches = relsXml.matchAll(
    /<Relationship[^>]+Id="([^"]+)"[^>]+Type="([^"]+)"[^>]+Target="([^"]+)"[^>]*\/?>/g
  );
  for (const match of relMatches) {
    const [, rId, type, target] = match;
    const ext = target.split('.').pop()?.toLowerCase() || '';
    if (type.includes('/image')) {
      relationships.push({ type: 'image', target, rId });
    } else if (type.includes('/video') || (type.includes('/media') && VIDEO_EXTENSIONS.has(ext))) {
      // Modern PowerPoint uses /media for embedded videos (not /video)
      relationships.push({ type: 'video', target, rId });
    } else if (type.includes('/hyperlink')) {
      relationships.push({ type: 'hyperlink', target, rId });
    } else {
      relationships.push({ type: 'other', target, rId });
    }
  }
  return relationships;
}

function resolveMediaZipPath(slideFile: string, target: string): string {
  const cleaned = target.replace(/^\.\.\//, 'ppt/');
  if (cleaned.startsWith('ppt/')) return cleaned;
  const slideDir = slideFile.replace(/[^/]+$/, '');
  return slideDir + target.replace(/^\.\.\//, '');
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildSlideHtml(slide: SlideData, totalSlides: number): string {
  const S = {
    wrap:         'direction:rtl;font-family:"Segoe UI",Arial,sans-serif;padding:8px 0;',
    header:       'display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:20px;',
    slideCounter: 'font-size:13px;color:#94a3b8;white-space:nowrap;',
    slideTitle:   'font-size:22px;font-weight:700;color:#0f172a;margin:0;',
    bodyBox:      'background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:16px;color:#1e293b;',
    videoWrap:    'position:relative;width:100%;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12);margin-bottom:16px;',
    iframe:       'position:absolute;top:0;left:0;width:100%;height:100%;border:0;',
    imgWrap:      'border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);',
    img:          'width:100%;height:auto;max-height:420px;object-fit:contain;background:#f8fafc;display:block;',
    chapterWrap:  'display:flex;align-items:center;justify-content:center;min-height:50vh;',
    chapterInner: 'text-align:center;',
    chapterBadge: 'display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:#dbeafe;border-radius:16px;margin-bottom:16px;',
    chapterNum:   'font-size:24px;font-weight:700;color:#2563eb;',
    chapterTitle: 'font-size:36px;font-weight:800;color:#0f172a;margin:0;',
  };

  // Use extracted title if available, fall back to "שקופית N"
  const titleHtml = slide.slideTitle
    ? `<h2 style="${S.slideTitle}">${escapeHtml(slide.slideTitle)}</h2>`
    : `<h2 style="${S.slideTitle}">שקופית ${slide.index}</h2>`;

  // Body: prefer structured bodyHtml (preserves formatting); fall back to AI summary or plain text
  const bodyContent = slide.bodyHtml ||
    (slide.aiSummary
      ? `<p style="margin:0 0 8px;line-height:1.8;font-size:15px;color:inherit;">${escapeHtml(sanitizeText(slide.aiSummary))}</p>`
      : (slide.text
          ? `<p style="margin:0 0 8px;line-height:1.8;font-size:15px;color:inherit;">${escapeHtml(sanitizeText(slide.text))}</p>`
          : ''));

  const headerHtml = `<div style="${S.header}">
    ${titleHtml}
    <span style="${S.slideCounter}">${slide.index} / ${totalSlides}</span>
  </div>`;

  // ── YouTube / Vimeo ──────────────────────────────────────────────────────────
  if (slide.externalVideoUrl) {
    const ytMatch = slide.externalVideoUrl.match(/(?:youtu\.be\/|watch\?v=|embed\/)([A-Za-z0-9_-]{11})/);
    const isYoutube = slide.externalVideoUrl.includes('youtube.com') || slide.externalVideoUrl.includes('youtu.be');
    const embedUrl = isYoutube && ytMatch
      ? `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`
      : slide.externalVideoUrl.includes('vimeo.com')
      ? `https://player.vimeo.com/video/${slide.externalVideoUrl.split('vimeo.com/')[1]}`
      : slide.externalVideoUrl;

    return `<div style="${S.wrap}">
  ${headerHtml}
  <div style="${S.videoWrap}">
    <iframe src="${embedUrl}" style="${S.iframe}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen></iframe>
  </div>
  ${bodyContent ? `<div style="${S.bodyBox}">${bodyContent}</div>` : ''}
</div>`;
  }

  // ── Embedded video from storage (mp4/mov etc.) ──────────────────────────────
  if (slide.videoStoragePath && !slide.externalVideoUrl) {
    return `<div style="${S.wrap}">
  ${headerHtml}
  <div style="background:#0f172a;border-radius:12px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
    <div style="text-align:center;color:#94a3b8;">
      <div style="font-size:48px;margin-bottom:8px;">▶</div>
      <p style="font-size:14px;">סרטון מוטמע</p>
    </div>
  </div>
  ${bodyContent ? `<div style="${S.bodyBox}">${bodyContent}</div>` : ''}
</div>`;
  }

  // ── Chapter / title slide ────────────────────────────────────────────────────
  if (slide.isChapterSlide) {
    return `<div style="${S.wrap}">
  <div style="${S.chapterWrap}">
    <div style="${S.chapterInner}">
      <div style="${S.chapterBadge}">
        <span style="${S.chapterNum}">${slide.index}</span>
      </div>
      <h1 style="${S.chapterTitle}">${escapeHtml(sanitizeText(slide.slideTitle || slide.text))}</h1>
    </div>
  </div>
</div>`;
  }

  // ── Regular slide ────────────────────────────────────────────────────────────
  const imageHtml = (slide.imageUrls || [])
    .map((url) => `<div style="${S.imgWrap}">
    <img src="${url}" alt="תמונה מהשקופית" style="${S.img}" loading="lazy" />
  </div>`)
    .join('');

  return `<div style="${S.wrap}">
  ${headerHtml}
  ${bodyContent ? `<div style="${S.bodyBox}">${bodyContent}</div>` : ''}
  ${imageHtml}
</div>`;
}

// ─── Section grouping ─────────────────────────────────────────────────────────

function groupSlidesIntoSections(slides: SlideData[]): Array<{
  sectionTitle: string;
  sectionIndex: number;
  slides: SlideData[];
}> {
  const groups: Array<{ sectionTitle: string; sectionIndex: number; slides: SlideData[] }> = [];
  let current: { sectionTitle: string; sectionIndex: number; slides: SlideData[] } | null = null;
  let pendingChapterTitle: string | null = null;

  for (const slide of slides) {
    if (slide.isChapterSlide) {
      // Save previous group only if it has slides
      if (current && current.slides.length > 0) groups.push(current);
      // Store chapter title to apply to the next content group
      pendingChapterTitle = sanitizeText(slide.text) || `פרק ${groups.length + 1}`;
      current = null;
    } else {
      if (!current) {
        // Start a new section — use the pending chapter title if available
        current = {
          sectionTitle: pendingChapterTitle || sanitizeText(slide.text).substring(0, 60) || `פרק ${groups.length + 1}`,
          sectionIndex: groups.length,
          slides: [slide],
        };
        pendingChapterTitle = null;
      } else {
        current.slides.push(slide);
      }
    }
  }

  if (current && current.slides.length > 0) groups.push(current);

  if (groups.length === 0 && slides.length > 0) {
    return [{ sectionTitle: 'תוכן', sectionIndex: 0, slides }];
  }
  return groups;
}

// ─── Main export ──────────────────────────────────────────────────────────────
// Accepts a file path (temp file on disk) instead of a Buffer
// This means the 271MB PPTX is NEVER loaded fully into RAM

export async function processPptx(
  filePath: string,
  assetId: string,
  originalName: string,
  supabase?: SupabaseClient,
  onProgress?: (message: string) => void
): Promise<ProcessingResult> {
  const log = (msg: string) => {
    logger.info({ assetId, msg }, '[PPTX]');
    onProgress?.(msg);
  };

  log(`מעבד PPTX: ${originalName}`);
  log(`קורא שקופיות מהדיסק (ללא טעינה לזיכרון)...`);

  // Load only XML files from ZIP — media stays on disk
  const xmlEntries = await readZipEntries(filePath);

  const slideFiles = [...xmlEntries.keys()]
    .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  const totalSlides = slideFiles.length;
  log(`נמצאו ${totalSlides} שקופיות`);

  // ── Phase 1: Parse slides (XML only, all tiny) ────────────────────────────
  const slides: SlideData[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const xmlBuf = xmlEntries.get(slideFile);
    if (!xmlBuf) {
      logger.warn({ slideFile }, '[PPTX] Missing XML for slide, skipping');
      continue;
    }
    const xml = xmlBuf.toString('utf8');

    const { title: slideTitle, bodyHtml, plainText } = extractSlideContent(xml);
    const text = plainText; // kept for backward-compat (isChapterSlide, AI enrichment)

    // Parse rels XML first — YouTube/Vimeo URLs are stored in the rels file
    // (as External Target on the /video relationship), NOT in the slide body XML.
    const relsKey = slideFile.replace(
      /ppt\/slides\/(slide\d+\.xml)/,
      'ppt/slides/_rels/$1.rels'
    );
    const relsXml = xmlEntries.get(relsKey)?.toString('utf8') || '';
    const relationships = parseRelationships(relsXml);

    // Check slide body first, fall back to rels file (covers all PowerPoint versions)
    const externalVideoUrl = extractExternalVideoUrl(xml) ?? extractExternalVideoUrl(relsXml);

    const hasMedia =
      relationships.some((r) => r.type === 'image' || r.type === 'video') ||
      !!externalVideoUrl;

    slides.push({
      index: i + 1,
      text,
      slideTitle,
      bodyHtml,
      isChapterSlide: isChapterSlide(text, hasMedia),
      externalVideoUrl,
      hasMedia,
      relationships,
      imageUrls: [],
    });
  }

  // Free XML entries from memory — we don't need them anymore
  xmlEntries.clear();

  // ── Phase 2: Upload media (reads one entry at a time from disk) ───────────
  if (supabase) {
    log(`מעלה תמונות וסרטונים...`);
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      for (const rel of slide.relationships) {
        const zipPath = resolveMediaZipPath(slideFiles[i], rel.target);
        if (rel.type === 'image') {
          const ext = rel.target.split('.').pop()?.toLowerCase() || 'png';
          const storagePath = `pptx-media/${assetId}/slide${i + 1}_${rel.rId}.${ext}`;
          const url = await uploadMediaEntry(filePath, zipPath, supabase, storagePath, mimeFromPath(rel.target));
          if (url) slide.imageUrls!.push(url);
        } else if (rel.type === 'video' && !slide.externalVideoUrl) {
          const ext = rel.target.split('.').pop()?.toLowerCase() || 'mp4';
          const storagePath = `pptx-media/${assetId}/slide${i + 1}_video.${ext}`;
          const url = await uploadMediaEntry(filePath, zipPath, supabase, storagePath, mimeFromPath(rel.target));
          // Store relative path (not public URL) — VideoLesson.tsx calls createSignedUrl(path)
          if (url) slide.videoStoragePath = storagePath;
        }
      }
    }
    log(`העלאת מדיה הושלמה`);
  }

  // ── Phase 3: AI enrichment ────────────────────────────────────────────────
  log(`מעשיר תוכן עם AI...`);
  const pagesToEnrich = slides
    .filter((s) => !s.isChapterSlide && s.text.trim().length >= 30)
    .map((s, idx) => ({ index: idx, text: s.text, title: `שקופית ${s.index}` }));

  const aiResults = await enrichPagesBatch(pagesToEnrich, 5);
  log(`AI הושלם: ${aiResults.size} עמודים עושרו`);

  // ── Phase 4: Build output ─────────────────────────────────────────────────
  const sectionGroups = groupSlidesIntoSections(slides);
  const sections: SectionOutput[] = [];
  const pages: PageOutput[] = [];
  const questions: QuestionOutput[] = [];
  let globalPageIndex = 0;
  let enrichIdx = 0;

  for (const group of sectionGroups) {
    const sectionIndex = sections.length;
    sections.push({
      title: sanitizeText(group.sectionTitle),
      orderIndex: sectionIndex,
      assetId,
      metadata: { slideCount: group.slides.length },
    });

    for (const slide of group.slides) {
      const aiData = aiResults.get(enrichIdx);
      slide.aiSummary = aiData?.summary;

      pages.push({
        sectionIndex,
        orderIndex: globalPageIndex,
        pageType: (slide.externalVideoUrl || slide.videoStoragePath) ? 'video' : 'pptx_slide',
        title: sanitizeText(slide.slideTitle || slide.text).substring(0, 80) || `שקופית ${slide.index}`,
        htmlContent: buildSlideHtml(slide, totalSlides),
        assetId,
        videoStoragePath: slide.videoStoragePath,
        slideIndex: slide.index,
        sourceRefs: {
          slideIndex: slide.index,
          hasMedia: slide.hasMedia,
          externalVideoUrl: slide.externalVideoUrl,
          ai: !!aiData,
        },
      });

      if (aiData?.questions?.length) {
        for (const q of aiData.questions) {
          questions.push({ ...q, pageIndex: globalPageIndex });
        }
      }

      globalPageIndex++;
      // Must match the pagesToEnrich filter: non-chapter AND text.length >= 30
      if (!slide.isChapterSlide && slide.text.trim().length >= 30) enrichIdx++;
    }
  }

  log(`הושלם: ${sections.length} פרקים, ${pages.length} עמודים, ${questions.length} שאלות`);
  return { sections, pages, questions, derivedAssets: [] };
}
