/*
  # Increase storage bucket file size limit

  Increases the course-assets bucket file size limit from 50MB to 500MB
  to support larger PowerPoint and other presentation files.
*/

UPDATE storage.buckets
SET file_size_limit = 524288000
WHERE id = 'course-assets';
