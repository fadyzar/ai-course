import JSZip from 'jszip';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  ProcessingResult,
  SectionOutput,
  PageOutput,
  QuestionOutput,
  SlideData,
  SlideRelationship,
  DerivedAsset,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

const YOUTUBE_PATTERN = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/;
const VIMEO_PATTERN = /vimeo\.com\/(\d+)/;

const VIDEO_MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
};

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
  if (youtubeMatch) {
    return `https://www.youtube.com/watch?v=${youtubeMatch[1]}`;
  }
  const vimeoMatch = xml.match(VIMEO_PATTERN);
  if (vimeoMatch) {
    return `https://vimeo.com/${vimeoMatch[1]}`;
  }
  return undefined;
}

function isChapterSlide(text: string, hasMedia: boolean): boolean {
  if (hasMedia) return false;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length > 30) return false;
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= 2 && words.length >= 2 && words.length <= 15) return true;
  return false;
}

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

function buildSlideHtml(slide: SlideData, totalSlides: number): string {
  const escapedText = escapeHtml(sanitizeText(slide.text));

  if (slide.externalVideoUrl) {
    const isYoutube = slide.externalVideoUrl.includes('youtube.com') || slide.externalVideoUrl.includes('youtu.be');
    const videoIdMatch = slide.externalVideoUrl.match(
      /(?:youtu\.be\/|watch\?v=|embed\/)([A-Za-z0-9_-]{11})/
    );
    const embedUrl = isYoutube && videoIdMatch
      ? `https://www.youtube.com/embed/${videoIdMatch[1]}`
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
    <p class="text-slate-700 leading-relaxed text-sm">${escapedText}</p>
  </div>` : ''}
</div>`;
  }

  if (slide.isChapterSlide) {
    return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="flex items-center justify-center min-h-[40vh]">
    <div class="text-center space-y-4">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
        <span class="text-2xl font-bold text-blue-600">${slide.index}</span>
      </div>
      <h1 class="text-4xl font-bold text-slate-900">${escapedText}</h1>
    </div>
  </div>
</div>`;
  }

  return `<div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
  <div class="border-b border-slate-200 pb-3">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold text-slate-900">שקופית ${slide.index}</h2>
      <span class="text-sm text-slate-400">שקופית ${slide.index} מתוך ${totalSlides}</span>
    </div>
  </div>
  <div class="bg-slate-50 p-6 rounded-xl border border-slate-200">
    <p class="text-slate-800 leading-relaxed whitespace-pre-wrap">${escapedText}</p>
  </div>
</div>`;
}

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

async function extractAndUploadEmbeddedVideo(
  zip: JSZip,
  relationship: SlideRelationship,
  slideFile: string,
  courseId: string,
  slideIndex: number,
  supabase: SupabaseClient,
  log: (msg: string) => void
): Promise<{ storagePath: string; derivedAsset: DerivedAsset } | null> {
  try {
    const rawTarget = relationship.target.replace(/^\.\.\//, '');
    const fullPath = `ppt/${rawTarget}`;

    const videoFile = zip.files[fullPath];
    if (!videoFile) {
      log(`לא נמצא קובץ וידאו ב-ZIP: ${fullPath}`);
      return null;
    }

    const ext = fullPath.split('.').pop()?.toLowerCase() || 'mp4';
    const mimeType = VIDEO_MIME_MAP[ext] || 'video/mp4';
    const videoBuffer = await videoFile.async('nodebuffer');
    const sizeBytes = videoBuffer.length;
    const storagePath = `${courseId}/extracted-video-slide${slideIndex}-${Date.now()}.${ext}`;

    log(`מעלה סרטון מוטמע מ-PPTX: שקופית ${slideIndex} (${Math.round(sizeBytes / 1024)}KB)`);

    const { error: uploadError } = await supabase.storage
      .from('course-assets')
      .upload(storagePath, videoBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    (videoBuffer as any).buffer?.fill(0);

    if (uploadError) {
      log(`שגיאה בהעלאת סרטון מוטמע: ${uploadError.message}`);
      return null;
    }

    log(`סרטון מוטמע הועלה: ${storagePath}`);

    const derivedAsset: DerivedAsset = {
      storagePath,
      originalName: `video-slide-${slideIndex}.${ext}`,
      mimeType,
      sizeBytes,
      sourceSlideIndex: slideIndex,
    };

    return { storagePath, derivedAsset };
  } catch (err: any) {
    log(`שגיאה בחילוץ סרטון מוטמע: ${err.message}`);
    return null;
  }
}

export async function processPptx(
  buffer: Buffer,
  assetId: string,
  originalName: string,
  onProgress?: (message: string) => void,
  supabase?: SupabaseClient,
  courseId?: string
): Promise<ProcessingResult> {
  const log = (msg: string) => {
    logger.info({ assetId, msg }, '[PPTX]');
    onProgress?.(msg);
  };

  log(`פותח קובץ PPTX: ${originalName}`);

  const zip = await JSZip.loadAsync(buffer);
  (buffer as any).buffer?.fill(0);

  const slideFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  const totalSlides = slideFiles.length;
  log(`נמצאו ${totalSlides} שקופיות`);

  const slides: (SlideData & { embeddedVideoStoragePath?: string })[] = [];
  const derivedAssets: DerivedAsset[] = [];
  const embeddedVideoMap = new Map<number, string>();

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const xml = await zip.files[slideFile].async('text');

    const text = sanitizeText(extractTextFromXml(xml));
    const externalVideoUrl = extractExternalVideoUrl(xml);
    const relationships = await parseSlideRelationships(zip, slideFile);

    const videoRels = relationships.filter((r) => r.type === 'video');
    let embeddedVideoStoragePath: string | undefined;

    if (videoRels.length > 0 && supabase && courseId) {
      for (const videoRel of videoRels) {
        const result = await extractAndUploadEmbeddedVideo(
          zip,
          videoRel,
          slideFile,
          courseId,
          i + 1,
          supabase,
          log
        );
        if (result) {
          embeddedVideoStoragePath = result.storagePath;
          derivedAssets.push(result.derivedAsset);
          embeddedVideoMap.set(i + 1, result.storagePath);
          break;
        }
      }
    }

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
      embeddedVideoStoragePath,
    });
  }

  log(`מסווג שקופיות לפרקים...`);
  const sectionGroups = groupSlidesIntoSections(slides);

  const sections: SectionOutput[] = [];
  const pages: PageOutput[] = [];
  const questions: QuestionOutput[] = [];

  let globalPageIndex = 0;

  for (const group of sectionGroups) {
    const sectionIndex = sections.length;

    sections.push({
      title: sanitizeText(group.sectionTitle),
      orderIndex: sectionIndex,
      assetId,
      metadata: { slideCount: group.slides.length },
    });

    for (const slide of group.slides as (SlideData & { embeddedVideoStoragePath?: string })[]) {
      const embeddedPath = embeddedVideoMap.get(slide.index);

      let pageType: 'pptx_slide' | 'video' = 'pptx_slide';
      let videoStoragePath: string | undefined;

      if (embeddedPath) {
        pageType = 'video';
        videoStoragePath = embeddedPath;
      } else if (slide.externalVideoUrl) {
        pageType = 'video';
      }

      const html = buildSlideHtml(slide, totalSlides);

      pages.push({
        sectionIndex,
        orderIndex: globalPageIndex,
        pageType,
        title: slide.text ? slide.text.substring(0, 80) : `שקופית ${slide.index}`,
        htmlContent: html,
        assetId,
        slideIndex: slide.index,
        videoStoragePath,
        sourceRefs: {
          slideIndex: slide.index,
          hasMedia: slide.hasMedia,
          externalVideoUrl: slide.externalVideoUrl,
          embeddedVideoStoragePath: videoStoragePath,
          ai: false,
        },
      });

      globalPageIndex++;
    }
  }

  log(
    `הושלם: ${sections.length} פרקים, ${pages.length} עמודים, ${derivedAssets.length} סרטונים מוטמעים`
  );

  return {
    sections,
    pages,
    questions,
    derivedAssets,
  };
}
