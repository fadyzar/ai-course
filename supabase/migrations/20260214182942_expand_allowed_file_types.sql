/*
  # Expand Allowed File Types for Storage Bucket
  
  1. Changes
    - Update `course-assets` bucket to allow more file types
    - Add support for: PPT, DOC, additional image formats (GIF, WebP, SVG, BMP)
    - Add support for: additional video formats (MPEG, MOV, AVI, WebM)
    - Add support for: additional audio formats (OGG, M4A)
    - Add support for: additional archive formats (RAR, 7Z)
  
  2. Security
    - File size limit remains at 50MB (52428800 bytes)
    - RLS policies remain unchanged
    - Public read access maintained for sharing
*/

-- Update storage bucket to allow more MIME types
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  -- Documents
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  -- Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  -- Videos
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  -- Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  -- Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed'
]
WHERE id = 'course-assets';