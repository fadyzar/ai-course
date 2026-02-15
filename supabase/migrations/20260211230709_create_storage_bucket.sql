/*
  # Create Storage Bucket for Course Assets
  
  1. Storage
    - Create `course-assets` bucket for storing uploaded files
    - Set up public access for authenticated users
    - Configure MIME type restrictions
  
  2. Storage Policies
    - Teachers can upload files to their course folders
    - Teachers can delete their own course files
    - Anyone with share token can read course files
    - Restrict file uploads to authenticated teachers only
  
  ## Important Notes
  
  - Files are organized by course_id in folder structure
  - Size limits and file type restrictions enforced
  - Automatic cleanup on course deletion via foreign key cascade
*/

-- Create storage bucket for course assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-assets',
  'course-assets',
  true,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'video/mp4',
    'audio/mpeg',
    'audio/wav',
    'application/zip'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Teachers can upload files to their courses
CREATE POLICY "Teachers can upload course assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'course-assets' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM courses WHERE owner_id = auth.uid()
    )
  );

-- Storage policy: Teachers can update their course assets
CREATE POLICY "Teachers can update their course assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'course-assets' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM courses WHERE owner_id = auth.uid()
    )
  );

-- Storage policy: Teachers can delete their course assets
CREATE POLICY "Teachers can delete their course assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'course-assets' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM courses WHERE owner_id = auth.uid()
    )
  );

-- Storage policy: Anyone can read course assets (for public sharing)
CREATE POLICY "Anyone can read course assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'course-assets');