/*
  # Add page_type, video_storage_path, asset_id, title, pdf_page_num to course_pages

  ## Summary
  This migration extends the course_pages table to support different content types:
  - text: Regular HTML/text content (existing)
  - pdf: A single PDF page rendered via PDF.js
  - pptx_slide: A single slide extracted from a PPTX file
  - video: A video asset stored in Supabase Storage
  - quiz: A quiz-only page (no content body)

  ## New Columns on course_pages
  - `page_type` (text, default 'text') — discriminator for the renderer to use
  - `title` (text, nullable) — display title for sidebar navigation
  - `asset_id` (uuid, FK → course_assets) — which uploaded asset this page belongs to
  - `video_storage_path` (text, nullable) — Storage path used to create a signed URL for video playback
  - `pdf_page_num` (integer, nullable) — 1-based page number inside a PDF asset
  - `slide_index` (integer, nullable) — 0-based slide index inside a PPTX asset

  ## No data is destroyed — only new nullable columns are added.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_pages' AND column_name = 'page_type'
  ) THEN
    ALTER TABLE course_pages ADD COLUMN page_type TEXT NOT NULL DEFAULT 'text';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_pages' AND column_name = 'title'
  ) THEN
    ALTER TABLE course_pages ADD COLUMN title TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_pages' AND column_name = 'asset_id'
  ) THEN
    ALTER TABLE course_pages ADD COLUMN asset_id UUID REFERENCES course_assets(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_pages' AND column_name = 'video_storage_path'
  ) THEN
    ALTER TABLE course_pages ADD COLUMN video_storage_path TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_pages' AND column_name = 'pdf_page_num'
  ) THEN
    ALTER TABLE course_pages ADD COLUMN pdf_page_num INTEGER;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_pages' AND column_name = 'slide_index'
  ) THEN
    ALTER TABLE course_pages ADD COLUMN slide_index INTEGER;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_sections' AND column_name = 'asset_id'
  ) THEN
    ALTER TABLE course_sections ADD COLUMN asset_id UUID REFERENCES course_assets(id) ON DELETE SET NULL;
  END IF;
END $$;
