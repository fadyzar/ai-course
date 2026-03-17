import JSZip from 'jszip';
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

// ─── Text extraction ──────────────────────────────────────────────────────────

function extractTextFromXml(xml: string): string {
  const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
  return matches
    .map((m) => m.replace(/<\/?a:t[^>]*>/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// ─── Relationships ────────────────────────────────────────────────────────────

async function parseSlideRelationships(
  zip: JSZip,
  slideFile: string
): Promise<SlideRelationship[]> {
  const relsPath = slideFile.replace(
    /ppt\/slides\/(slide\d+\.xml)/,
    'ppt/slides/_rels/$1.rels'
  );

  const relsFile = zip.files[relsPath];
  if (!relsFile) return [];

  const relsXml = await relsFile.async('text');
  const relationships: SlideRelationship[] = [];

  const relMatches = relsXml.matchAll(
    /<Relationship[^>]+Id="([^"]+)"[^>]+Type="([^"]+)"[^>]+Target="([^"]+)"[^>]*\/?>/g
  );

  for (const match of relMatches) {
    const [, rId, type, target] = match;
    if (type.includes('/image')) {
      relationships.push({ type: 'image', target, rId });
    } else if (type.includes('/video')) {
      relationships.push({ type: 'video', target, rId });
    } else if (type.includes('/hyperlink')) {
      relationships.push({ type: 'hyperlink', target, rId });
    } else {
      relationships.push({ type: 'other', target, rId });
    }
  }

  return relationships;
}

// ─── Media upload ─────────────────────────────────────────────────────────────

async function uploadMediaToStorage(
  supabase: SupabaseClient,
  zip: JSZip,
  zipPath: string,
  storagePath: string,
  mimeType: string
): Promise<string | null> {
  try {
    const zipEntry = zip.files[zipPath];
    if (!zipEntry) return null;

    const bytes = await zipEntry.async('uint8array');

    const { error } = await supabase.storage
      .from('course-assets')
      .upload(storagePath, bytes, { contentType: mimeType, upsert: true });

    if (error) {
      logger.warn({ zipPath, err: error.message }, '[PPTX] Media upload failed');
      return null;
    }

    const { data } = supabase.storage.from('course-assets').getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (err: any) {
    logger.warn({ zipPath, err: err.message }, '[PPTX] Media upload error');
    return null;
  }
}

function resolveMediaPath(slideFile: string, target: string): string {
  // target like "../media/image1.png" → "ppt/media/image1.png"
  const cleaned = target.replace(/^\.\.\//, 'ppt/');
  if (cleaned.startsWith('ppt/')) return cleaned;
  // fallback: relative to slide directory
  const slideDir = slideFile.replace(/[^/]+$/, '');
  return slideDir + target.replace(/^\.\.\//, '');
}

function mimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    wmv: 'video/x-ms-wmv',
  };
  return map[ext] || 'application/octet-stream';
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildSlideHtml(
  slide: SlideData & { imageUrls?: string[]; videoStoragePath?: string; aiSummary?: string },
  totalSlides: number
): string {
  const escapedText = escapeHtml(sanitizeText(slide.text));
  const displayText = slide.aiSummary
    ? escapeHtml(sanitizeText(slide.aiSummary))
    : escapedText;

  // ── Video slide (YouTube / Vimeo embed) ──
  if (slide.externalVideoUrl) {
    const videoIdMatch = slide.externalVideoUrl.match(
      /(?:youtu\.be\/|watch\?v=|embed\/)([A-Za-z0-9_-]{11})/
    );
    const isYoutube =
      slide.externalVideoUrl.includes('youtube.com') ||
      slide.externalVideoUrl.includes('youtu.be');
    const embedUrl =
      isYoutube && videoIdMatch
        ? `https://www.youtube.com/embed/${videoIdMatch[1]}`
        : slide.externalVideoUrl.includes('vimeo.com')
        ? slide.externalVideoUrl.replace('vimeo.com/', 'player.vimeo.com/video/')
        : slide.externalVideoUrl;

    return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="border-b border-slate-200 pb-3">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold text-slate-900">שקופית ${slide.index}</h2>
      <span class="text-sm text-slate-400">שקופית ${slide.index} מתוך ${totalSlides}</span>
    </div>
  </div>
  <div class="aspect-video w-full rounded-xl overflow-hidden shadow-lg">
    <iframe
      src="${embedUrl}"
      class="w-full h-full"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
  </div>
  ${slide.text ? `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
    <p class="text-slate-700 leading-relaxed text-sm">${displayText}</p>
  </div>` : ''}
</div>`;
  }

  // ── Video slide (embedded video from Storage) ──
  if (slide.videoStoragePath) {
    return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="border-b border-slate-200 pb-3">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold text-slate-900">שקופית ${slide.index}</h2>
      <span class="text-sm text-slate-400">שקופית ${slide.index} מתוך ${totalSlides}</span>
    </div>
  </div>
  <div class="aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black">
    <video controls class="w-full h-full" preload="metadata">
      <source src="${slide.videoStoragePath}" />
      הדפדפן שלך אינו תומך בתגית וידאו.
    </video>
  </div>
  ${displayText ? `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
    <p class="text-slate-700 leading-relaxed text-sm">${displayText}</p>
  </div>` : ''}
</div>`;
  }

  // ── Chapter slide ──
  if (slide.isChapterSlide) {
    return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="flex items-center justify-center min-h-[40vh]">
    <div class="text-center space-y-4">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
        <span class="text-2xl font-bold text-blue-600">${slide.index}</span>
      </div>
      <h1 class="text-4xl font-bold text-slate-900">${escapeHtml(sanitizeText(slide.text))}</h1>
    </div>
  </div>
</div>`;
  }

  // ── Regular slide with optional images ──
  const imageHtml = (slide.imageUrls || [])
    .map(
      (url) =>
        `  <div class="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
    <img src="${url}" alt="תמונה מהשקופית" class="w-full h-auto max-h-96 object-contain bg-slate-50" loading="lazy" />
  </div>`
    )
    .join('\n');

  return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="border-b border-slate-200 pb-3">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold text-slate-900">שקופית ${slide.index}</h2>
      <span class="text-sm text-slate-400">שקופית ${slide.index} מתוך ${totalSlides}</span>
    </div>
  </div>
  ${displayText ? `<div class="bg-slate-50 p-6 rounded-xl border border-slate-200">
    <p class="text-slate-800 leading-relaxed whitespace-pre-wrap">${displayText}</p>
  </div>` : ''}
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
  let currentGroup: { sectionTitle: string; sectionIndex: number; slides: SlideData[] } | null = null;

  for (const slide of slides) {
    if (slide.isChapterSlide || !currentGroup) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        sectionTitle: slide.text || `פרק ${groups.length + 1}`,
        sectionIndex: groups.length,
        slides: slide.isChapterSlide ? [] : [slide],
      };
      if (slide.isChapterSlide) {
        groups.push(currentGroup);
        currentGroup = null;
      }
    } else {
      currentGroup.slides.push(slide);
    }
  }

  if (currentGroup) groups.push(currentGroup);

  if (groups.length === 0 && slides.length > 0) {
    return [{ sectionTitle: 'תוכן', sectionIndex: 0, slides }];
  }

  return groups.filter((g) => g.sectionTitle || g.slides.length > 0);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function processPptx(
  buffer: Buffer,
  assetId: string,
  originalName: string,
  supabase?: SupabaseClient,
  onProgress?: (message: string) => void
): Promise<ProcessingResult> {
  const log = (msg: string) => {
    logger.info({ assetId, msg }, '[PPTX]');
    onProgress?.(msg);
  };

  log(`פותח קובץ PPTX: ${originalName}`);

  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  const totalSlides = slideFiles.length;
  log(`נמצאו ${totalSlides} שקופיות`);

  // ── Phase 1: Parse all slides ──────────────────────────────────────────────
  const slides: (SlideData & { imageUrls?: string[]; videoStoragePath?: string })[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const xml = await zip.files[slideFile].async('text');

    const text = sanitizeText(extractTextFromXml(xml));
    const externalVideoUrl = extractExternalVideoUrl(xml);
    const relationships = await parseSlideRelationships(zip, slideFile);

    const imageUrls: string[] = [];
    let videoStoragePath: string | undefined;

    // ── Extract media if Supabase client is available ──────────────────────
    if (supabase) {
      for (const rel of relationships) {
        if (rel.type === 'image') {
          const zipPath = resolveMediaPath(slideFile, rel.target);
          const ext = rel.target.split('.').pop()?.toLowerCase() || 'png';
          const storagePath = `pptx-media/${assetId}/slide${i + 1}_${rel.rId}.${ext}`;
          const mime = mimeFromPath(rel.target);
          const url = await uploadMediaToStorage(supabase, zip, zipPath, storagePath, mime);
          if (url) imageUrls.push(url);
        } else if (rel.type === 'video' && !externalVideoUrl) {
          // Embedded video file inside PPTX
          const zipPath = resolveMediaPath(slideFile, rel.target);
          const ext = rel.target.split('.').pop()?.toLowerCase() || 'mp4';
          const storagePath = `pptx-media/${assetId}/slide${i + 1}_video.${ext}`;
          const mime = mimeFromPath(rel.target);
          const url = await uploadMediaToStorage(supabase, zip, zipPath, storagePath, mime);
          if (url) videoStoragePath = url;
        }
      }

      if (imageUrls.length || videoStoragePath) {
        log(`שקופית ${i + 1}: ${imageUrls.length} תמונות${videoStoragePath ? ', וידאו מוטמע' : ''}`);
      }
    }

    const hasMedia =
      relationships.some((r) => r.type === 'image' || r.type === 'video') ||
      !!externalVideoUrl ||
      imageUrls.length > 0;

    slides.push({
      index: i + 1,
      text,
      isChapterSlide: isChapterSlide(text, hasMedia),
      externalVideoUrl,
      hasMedia,
      relationships,
      imageUrls,
      videoStoragePath,
    });
  }

  log(`מסווג שקופיות לפרקים...`);
  const sectionGroups = groupSlidesIntoSections(slides);

  // ── Phase 2: AI enrichment (only text slides with enough content) ──────────
  log(`מעשיר תוכן עם AI...`);

  const pagesToEnrich = slides
    .filter((s) => !s.isChapterSlide && s.text.trim().length >= 30)
    .map((s, idx) => ({ index: idx, text: s.text, title: `שקופית ${s.index}` }));

  const aiResults = await enrichPagesBatch(pagesToEnrich, 5);
  log(`AI הושלם: ${aiResults.size} עמודים עושרו`);

  // ── Phase 3: Build output ──────────────────────────────────────────────────
  const sections: SectionOutput[] = [];
  const pages: PageOutput[] = [];
  const questions: QuestionOutput[] = [];

  let globalPageIndex = 0;
  let enrichmentIndex = 0;

  for (const group of sectionGroups) {
    const sectionIndex = sections.length;

    sections.push({
      title: sanitizeText(group.sectionTitle),
      orderIndex: sectionIndex,
      assetId,
      metadata: { slideCount: group.slides.length },
    });

    for (const slide of group.slides) {
      const aiData = aiResults.get(enrichmentIndex);
      const isVideoSlide = !!slide.externalVideoUrl || !!slide.videoStoragePath;
      const pageType = isVideoSlide ? 'video' : 'pptx_slide';

      const slideWithAi = { ...slide, aiSummary: aiData?.summary };
      const html = buildSlideHtml(slideWithAi, totalSlides);

      const pageTitle = slide.text
        ? sanitizeText(slide.text).substring(0, 80)
        : `שקופית ${slide.index}`;

      pages.push({
        sectionIndex,
        orderIndex: globalPageIndex,
        pageType,
        title: pageTitle,
        htmlContent: html,
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

      // Add AI-generated questions
      if (aiData?.questions?.length) {
        for (const q of aiData.questions) {
          questions.push({ ...q, pageIndex: globalPageIndex });
        }
      }

      globalPageIndex++;
      if (!slide.isChapterSlide) enrichmentIndex++;
    }
  }

  log(`הושלם: ${sections.length} פרקים, ${pages.length} עמודים, ${questions.length} שאלות`);

  return { sections, pages, questions, derivedAssets: [] };
}
