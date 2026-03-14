const VIDEO_TYPES = new Set(['mp4', 'mpeg', 'mov', 'avi', 'webm', 'mkv', 'm4v']);
const DOCUMENT_TYPES = new Set(['pptx', 'ppt', 'pdf', 'docx', 'doc', 'xlsx', 'xls']);

export type FileCategory = 'pptx' | 'pdf' | 'docx' | 'video' | 'unknown';

export function detectFileCategory(fileType: string): FileCategory {
  const ext = fileType.toLowerCase().replace(/^\./, '');

  if (ext === 'pptx' || ext === 'ppt') return 'pptx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (VIDEO_TYPES.has(ext)) return 'video';

  return 'unknown';
}

export function isVideoFile(fileType: string): boolean {
  return detectFileCategory(fileType) === 'video';
}

export function isPptxFile(fileType: string): boolean {
  return detectFileCategory(fileType) === 'pptx';
}

export function isPdfFile(fileType: string): boolean {
  return detectFileCategory(fileType) === 'pdf';
}

export function isDocxFile(fileType: string): boolean {
  return detectFileCategory(fileType) === 'docx';
}
