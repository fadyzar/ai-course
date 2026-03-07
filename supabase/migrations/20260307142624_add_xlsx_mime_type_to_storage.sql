/*
  # Add XLSX MIME type to course-assets storage bucket

  1. Changes
    - Add `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX) to allowed MIME types
    - Add `application/vnd.ms-excel` (XLS) to allowed MIME types
    - Enables importing Google Sheets (exported as XLSX) into courses
*/

UPDATE storage.buckets
SET allowed_mime_types = array_append(
  array_append(
    allowed_mime_types,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ),
  'application/vnd.ms-excel'
)
WHERE id = 'course-assets'
  AND NOT ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = ANY(allowed_mime_types));
