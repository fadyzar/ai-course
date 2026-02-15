/*
  # Add AI-Generated Flag to Course Pages

  1. Changes
    - Add `is_ai_generated` boolean column to `course_pages` table to track AI-generated content
    - Add `ai_metadata` jsonb column to store AI processing metadata (model used, confidence, etc.)
    
  2. Notes
    - Default is false for existing pages (placeholder content)
    - New AI-generated pages will be marked as true
*/

-- Add is_ai_generated flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_pages' AND column_name = 'is_ai_generated'
  ) THEN
    ALTER TABLE course_pages ADD COLUMN is_ai_generated boolean DEFAULT false;
  END IF;
END $$;

-- Add ai_metadata for storing AI processing information
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_pages' AND column_name = 'ai_metadata'
  ) THEN
    ALTER TABLE course_pages ADD COLUMN ai_metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;
