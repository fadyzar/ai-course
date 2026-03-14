import { ProcessingResult, SectionOutput, PageOutput } from '../types/index.js';
import { logger } from '../utils/logger.js';

function sanitizeText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\x00/g, '').trim();
}

export async function processVideo(
  storagePath: string,
  assetId: string,
  originalName: string,
  onProgress?: (message: string) => void
): Promise<ProcessingResult> {
  const log = (msg: string) => {
    logger.info({ assetId, msg }, '[VIDEO]');
    onProgress?.(msg);
  };

  log(`מעבד סרטון: ${originalName}`);

  const title = sanitizeText(originalName.replace(/\.[^.]+$/, ''));

  const section: SectionOutput = {
    title,
    orderIndex: 0,
    assetId,
    sourceSlideId: `video_asset_${assetId}`,
    metadata: { source: 'video' },
  };

  const page: PageOutput = {
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
