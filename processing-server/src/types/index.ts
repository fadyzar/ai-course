export type PageType = 'text' | 'pdf' | 'pptx_slide' | 'video' | 'quiz';
export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export interface SectionOutput {
  title: string;
  orderIndex: number;
  sourceSlideId?: string;
  assetId?: string;
  metadata?: Record<string, unknown>;
}

export interface PageOutput {
  sectionIndex: number;
  orderIndex: number;
  pageType: PageType;
  title?: string;
  htmlContent: string;
  assetId?: string;
  videoStoragePath?: string;
  pdfPageNum?: number;
  slideIndex?: number;
  sourceRefs?: Record<string, unknown>;
}

export interface QuestionOutput {
  pageIndex: number;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string[];
  confidence: number;
}

export interface DerivedAsset {
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sourceSlideIndex?: number;
}

export interface ProcessingResult {
  sections: SectionOutput[];
  pages: PageOutput[];
  questions: QuestionOutput[];
  derivedAssets: DerivedAsset[];
}

export interface SlideData {
  index: number;
  text: string;
  isChapterSlide: boolean;
  externalVideoUrl?: string;
  hasMedia: boolean;
  relationships: SlideRelationship[];
  imageUrls?: string[];
  videoStoragePath?: string;
  aiSummary?: string;
}

export interface SlideRelationship {
  type: 'image' | 'video' | 'hyperlink' | 'other';
  target: string;
  rId: string;
}

export interface ProcessAssetRequest {
  assetId: string;
  courseId: string;
  userId?: string;
}

export interface ProcessJobRequest {
  jobId: string;
}

export interface ProcessingResponse {
  success: boolean;
  jobId?: string;
  assetId?: string;
  courseId?: string;
  sections?: number;
  pages?: number;
  questions?: number;
  error?: string;
  code?: string;
}

export interface JobRecord {
  id: string;
  course_id: string;
  asset_id: string | null;
  type: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AssetRecord {
  id: string;
  course_id: string;
  file_type: string;
  storage_path: string;
  original_name: string;
  size_bytes: number;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
