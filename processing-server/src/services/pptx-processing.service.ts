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

function parseRelationships(relsXml: string): SlideRelationship[] {
  const relationships: SlideRelationship[] = [];
  const relMatches = relsXml.matchAll(
    /<Relationship[^>]+Id="([^"]+)"[^>]+Type="([^"]+)"[^>]+Target="([^"]+)"[^>]*\/?>/g
  );
  for (const match of relMatches) {
    const [, rId, type, target] = match;
    if (type.includes('/image')) relationships.push({ type: 'image', target, rId });
    else if (type.includes('/video')) relationships.push({ type: 'video', target, rId });
    else if (type.includes('/hyperlink')) relationships.push({ type: 'hyperlink', target, rId });
    else relationships.push({ type: 'other', target, rId });
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
  const displayText = escapeHtml(sanitizeText(slide.aiSummary || slide.text));

  if (slide.externalVideoUrl) {
    const videoIdMatch = slide.externalVideoUrl.match(
      /(?:youtu\.be\/|watch\?v=|embed\/)([A-Za-z0-9_-]{11})/
    );
    const isYoutube =
      slide.externalVideoUrl.includes('youtube.com') ||
      slide.externalVideoUrl.includes('youtu.be');
    const embedUrl = isYoutube && videoIdMatch
      ? `https://www.youtube.com/embed/${videoIdMatch[1]}`
      : slide.externalVideoUrl.includes('vimeo.com')
      ? `https://player.vimeo.com/video/${slide.externalVideoUrl.split('vimeo.com/')[1]}`
      : slide.externalVideoUrl;

    return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="border-b border-slate-200 pb-3 flex items-center justify-between">
    <h2 class="text-2xl font-bold text-slate-900">שקופית ${slide.index}</h2>
    <span class="text-sm text-slate-400">${slide.index} / ${totalSlides}</span>
  </div>
  <div class="aspect-video w-full rounded-xl overflow-hidden shadow-lg">
    <iframe src="${embedUrl}" class="w-full h-full" frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen></iframe>
  </div>
  ${displayText ? `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
    <p class="text-slate-700 leading-relaxed text-sm">${displayText}</p>
  </div>` : ''}
</div>`;
  }

  if (slide.videoStoragePath) {
    return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="border-b border-slate-200 pb-3 flex items-center justify-between">
    <h2 class="text-2xl font-bold text-slate-900">שקופית ${slide.index}</h2>
    <span class="text-sm text-slate-400">${slide.index} / ${totalSlides}</span>
  </div>
  <div class="aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black">
    <video controls class="w-full h-full" preload="metadata">
      <source src="${slide.videoStoragePath}" />
    </video>
  </div>
  ${displayText ? `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
    <p class="text-slate-700 leading-relaxed text-sm">${displayText}</p>
  </div>` : ''}
</div>`;
  }

  if (slide.isChapterSlide) {
    return `<div dir="rtl" class="max-w-4xl mx-auto py-4">
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

  const imageHtml = (slide.imageUrls || [])
    .map((url) => `<div class="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
    <img src="${url}" alt="תמונה מהשקופית" class="w-full h-auto max-h-96 object-contain bg-slate-50" loading="lazy" />
  </div>`)
    .join('\n');

  return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="border-b border-slate-200 pb-3 flex items-center justify-between">
    <h2 class="text-2xl font-bold text-slate-900">שקופית ${slide.index}</h2>
    <span class="text-sm text-slate-400">${slide.index} / ${totalSlides}</span>
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
  let current: { sectionTitle: string; sectionIndex: number; slides: SlideData[] } | null = null;

  for (const slide of slides) {
    if (slide.isChapterSlide || !current) {
      if (current) groups.push(current);
      current = {
        sectionTitle: slide.text || `פרק ${groups.length + 1}`,
        sectionIndex: groups.length,
        slides: slide.isChapterSlide ? [] : [slide],
      };
      if (slide.isChapterSlide) { groups.push(current); current = null; }
    } else {
      current.slides.push(slide);
    }
  }
  if (current) groups.push(current);
  if (groups.length === 0 && slides.length > 0) {
    return [{ sectionTitle: 'תוכן', sectionIndex: 0, slides }];
  }
  return groups.filter((g) => g.sectionTitle || g.slides.length > 0);
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
    const xml = xmlEntries.get(slideFile)!.toString('utf8');

    const text = sanitizeText(extractTextFromXml(xml));
    const externalVideoUrl = extractExternalVideoUrl(xml);

    // Parse rels XML
    const relsKey = slideFile.replace(
      /ppt\/slides\/(slide\d+\.xml)/,
      'ppt/slides/_rels/$1.rels'
    );
    const relsXml = xmlEntries.get(relsKey)?.toString('utf8') || '';
    const relationships = parseRelationships(relsXml);

    const hasMedia =
      relationships.some((r) => r.type === 'image' || r.type === 'video') ||
      !!externalVideoUrl;

    slides.push({
      index: i + 1,
      text,
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
          if (url) slide.videoStoragePath = url;
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
        title: sanitizeText(slide.text).substring(0, 80) || `שקופית ${slide.index}`,
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
      if (!slide.isChapterSlide) enrichIdx++;
    }
  }

  log(`הושלם: ${sections.length} פרקים, ${pages.length} עמודים, ${questions.length} שאלות`);
  return { sections, pages, questions, derivedAssets: [] };
}
