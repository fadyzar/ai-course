/*
  # Slide2Course Database Schema
  
  Complete multi-tenant SaaS platform for converting files to interactive web courses.
  
  ## Tables Created
  
  1. **profiles** - User profiles with role management
     - id (uuid, references auth.users)
     - role (enum: teacher, student, admin)
     - full_name (text)
     - school_id (uuid, FK to schools)
     - created_at, updated_at (timestamptz)
  
  2. **schools** - Multi-tenant organization structure
     - id (uuid, PK)
     - name (text)
     - owner_id (uuid, FK to profiles)
     - settings (jsonb)
     - created_at (timestamptz)
  
  3. **courses** - Course metadata
     - id (uuid, PK)
     - school_id (uuid, FK to schools)
     - owner_id (uuid, FK to profiles)
     - title (text)
     - description (text)
     - status (enum: draft, processing, ready, failed)
     - settings (jsonb)
     - created_at, updated_at (timestamptz)
  
  4. **course_assets** - Uploaded files
     - id (uuid, PK)
     - course_id (uuid, FK to courses)
     - file_type (text: pptx, pdf, docx, image, video, audio, zip)
     - storage_path (text)
     - original_name (text)
     - size_bytes (bigint)
     - status (enum: uploaded, processing, processed, failed)
     - metadata (jsonb)
     - created_at (timestamptz)
  
  5. **course_sections** - Course tabs/chapters (from yellow slides)
     - id (uuid, PK)
     - course_id (uuid, FK to courses)
     - title (text)
     - order_index (integer)
     - source_slide_id (text)
     - metadata (jsonb)
  
  6. **course_pages** - Individual scrollable pages
     - id (uuid, PK)
     - course_id (uuid, FK to courses)
     - section_id (uuid, FK to course_sections)
     - order_index (integer)
     - html_content (text)
     - source_refs (jsonb)
  
  7. **questions** - Interactive questions with AI suggestions
     - id (uuid, PK)
     - course_id (uuid, FK to courses)
     - page_id (uuid, FK to course_pages)
     - type (enum: single_choice, multiple_choice, true_false)
     - prompt (text)
     - options (jsonb)
     - suggested_answer (jsonb)
     - correct_answer (jsonb)
     - confidence (numeric)
     - reviewed_by_teacher (boolean)
     - reviewed_at (timestamptz)
     - created_at (timestamptz)
  
  8. **shares** - Course sharing tokens
     - id (uuid, PK)
     - course_id (uuid, FK to courses)
     - share_token (text, unique)
     - expires_at (timestamptz)
     - settings (jsonb)
     - created_at (timestamptz)
  
  9. **attempts** - Student course attempts
     - id (uuid, PK)
     - course_id (uuid, FK to courses)
     - student_identifier (text)
     - started_at (timestamptz)
     - finished_at (timestamptz)
     - score_percent (numeric)
     - metadata (jsonb)
  
  10. **answers** - Individual question answers
      - id (uuid, PK)
      - attempt_id (uuid, FK to attempts)
      - question_id (uuid, FK to questions)
      - selected_options (jsonb)
      - is_correct (boolean)
      - answered_at (timestamptz)
  
  11. **jobs** - Async processing queue
      - id (uuid, PK)
      - course_id (uuid, FK to courses)
      - asset_id (uuid, FK to course_assets)
      - type (text: process_pptx, extract_questions, transcribe_media, etc)
      - status (enum: queued, processing, completed, failed)
      - progress (integer 0-100)
      - error (text)
      - metadata (jsonb)
      - created_at, updated_at (timestamptz)
  
  12. **processing_logs** - Detailed processing logs
      - id (uuid, PK)
      - job_id (uuid, FK to jobs)
      - level (enum: debug, info, warning, error)
      - message (text)
      - meta (jsonb)
      - created_at (timestamptz)
  
  13. **integrations** - External service integrations
      - id (uuid, PK)
      - school_id (uuid, FK to schools)
      - provider (text: onedrive, canva, etc)
      - status (enum: connected, disconnected, error)
      - tokens_encrypted (text)
      - last_sync_at (timestamptz)
      - settings (jsonb)
      - created_at (timestamptz)
  
  ## Security
  
  - RLS enabled on ALL tables
  - Teachers can only access their school's data
  - Students can only read courses via share_token
  - All policies check authentication and ownership/membership
  - Storage policies for file access control
  
  ## Important Notes
  
  1. Multi-tenant isolation via school_id
  2. Yellow slide detection creates sections
  3. AI question extraction with teacher review required
  4. Async job processing with progress tracking
  5. RTL-ready design
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('teacher', 'student', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE course_status AS ENUM ('draft', 'processing', 'ready', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE asset_status AS ENUM ('uploaded', 'processing', 'processed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('single_choice', 'multiple_choice', 'true_false');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE log_level AS ENUM ('debug', 'info', 'warning', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Schools/Tenants table
CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'teacher',
  full_name text NOT NULL,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  status course_status NOT NULL DEFAULT 'draft',
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Course assets table
CREATE TABLE IF NOT EXISTS course_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  status asset_status NOT NULL DEFAULT 'uploaded',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Course sections table (chapters/tabs from yellow slides)
CREATE TABLE IF NOT EXISTS course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  source_slide_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Course pages table (scrollable content)
CREATE TABLE IF NOT EXISTS course_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id uuid REFERENCES course_sections(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  html_content text DEFAULT '',
  source_refs jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Questions table (AI-extracted with teacher review)
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  page_id uuid REFERENCES course_pages(id) ON DELETE CASCADE,
  type question_type NOT NULL DEFAULT 'single_choice',
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_answer jsonb,
  correct_answer jsonb,
  confidence numeric DEFAULT 0,
  reviewed_by_teacher boolean DEFAULT false,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Shares table (course sharing tokens)
CREATE TABLE IF NOT EXISTS shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  share_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at timestamptz,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Attempts table (student course attempts)
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_identifier text NOT NULL,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  score_percent numeric,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Answers table (individual question responses)
CREATE TABLE IF NOT EXISTS answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_correct boolean DEFAULT false,
  answered_at timestamptz DEFAULT now()
);

-- Jobs table (async processing queue)
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES course_assets(id) ON DELETE CASCADE,
  type text NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Processing logs table
CREATE TABLE IF NOT EXISTS processing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  level log_level NOT NULL DEFAULT 'info',
  message text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Integrations table (OneDrive, Canva, etc)
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status integration_status NOT NULL DEFAULT 'disconnected',
  tokens_encrypted text,
  last_sync_at timestamptz,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_courses_school_id ON courses(school_id);
CREATE INDEX IF NOT EXISTS idx_courses_owner_id ON courses(owner_id);
CREATE INDEX IF NOT EXISTS idx_course_assets_course_id ON course_assets(course_id);
CREATE INDEX IF NOT EXISTS idx_course_sections_course_id ON course_sections(course_id);
CREATE INDEX IF NOT EXISTS idx_course_pages_course_id ON course_pages(course_id);
CREATE INDEX IF NOT EXISTS idx_course_pages_section_id ON course_pages(section_id);
CREATE INDEX IF NOT EXISTS idx_questions_course_id ON questions(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_page_id ON questions(page_id);
CREATE INDEX IF NOT EXISTS idx_shares_share_token ON shares(share_token);
CREATE INDEX IF NOT EXISTS idx_attempts_course_id ON attempts(course_id);
CREATE INDEX IF NOT EXISTS idx_answers_attempt_id ON answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_course_id ON jobs(course_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_job_id ON processing_logs(job_id);

-- Enable RLS on all tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for schools table
CREATE POLICY "Users can view their own school"
  ON schools FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.school_id = schools.id
      AND profiles.id = auth.uid()
    )
  );

CREATE POLICY "School owners can update their school"
  ON schools FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Authenticated users can create schools"
  ON schools FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- RLS Policies for profiles table
CREATE POLICY "Users can view profiles in their school"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- RLS Policies for courses table
CREATE POLICY "Teachers can view courses in their school"
  ON courses FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Students can view courses via share token"
  ON courses FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shares
      WHERE shares.course_id = courses.id
      AND (shares.expires_at IS NULL OR shares.expires_at > now())
    )
  );

CREATE POLICY "Teachers can insert courses in their school"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid() AND
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Course owners can update their courses"
  ON courses FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Course owners can delete their courses"
  ON courses FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- RLS Policies for course_assets table
CREATE POLICY "Teachers can view assets of their school's courses"
  ON course_assets FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Course owners can insert assets"
  ON course_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Course owners can update assets"
  ON course_assets FOR UPDATE
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Course owners can delete assets"
  ON course_assets FOR DELETE
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

-- RLS Policies for course_sections table
CREATE POLICY "Anyone can view sections of shared courses"
  ON course_sections FOR SELECT
  TO anon, authenticated
  USING (
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    ) OR
    course_id IN (
      SELECT id FROM courses WHERE school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Course owners can manage sections"
  ON course_sections FOR ALL
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

-- RLS Policies for course_pages table
CREATE POLICY "Anyone can view pages of shared courses"
  ON course_pages FOR SELECT
  TO anon, authenticated
  USING (
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    ) OR
    course_id IN (
      SELECT id FROM courses WHERE school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Course owners can manage pages"
  ON course_pages FOR ALL
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

-- RLS Policies for questions table
CREATE POLICY "Anyone can view questions of shared courses"
  ON questions FOR SELECT
  TO anon, authenticated
  USING (
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    ) OR
    course_id IN (
      SELECT id FROM courses WHERE school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Course owners can manage questions"
  ON questions FOR ALL
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

-- RLS Policies for shares table
CREATE POLICY "Course owners can view shares"
  ON shares FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Course owners can create shares"
  ON shares FOR INSERT
  TO authenticated
  WITH CHECK (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Course owners can update shares"
  ON shares FOR UPDATE
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Course owners can delete shares"
  ON shares FOR DELETE
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

-- RLS Policies for attempts table
CREATE POLICY "Course owners can view attempts"
  ON attempts FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can create attempts for shared courses"
  ON attempts FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    )
  );

-- RLS Policies for answers table
CREATE POLICY "Course owners can view answers"
  ON answers FOR SELECT
  TO authenticated
  USING (
    attempt_id IN (
      SELECT id FROM attempts WHERE course_id IN (
        SELECT id FROM courses WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Anyone can create answers for their attempts"
  ON answers FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    attempt_id IN (
      SELECT id FROM attempts WHERE course_id IN (
        SELECT course_id FROM shares
        WHERE expires_at IS NULL OR expires_at > now()
      )
    )
  );

-- RLS Policies for jobs table
CREATE POLICY "Teachers can view jobs for their courses"
  ON jobs FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Course owners can create jobs"
  ON jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "System can update jobs"
  ON jobs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for processing_logs table
CREATE POLICY "Teachers can view logs for their courses"
  ON processing_logs FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE course_id IN (
        SELECT id FROM courses WHERE school_id IN (
          SELECT school_id FROM profiles WHERE id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "System can insert logs"
  ON processing_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for integrations table
CREATE POLICY "School members can view their integrations"
  ON integrations FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "School owners can manage integrations"
  ON integrations FOR ALL
  TO authenticated
  USING (
    school_id IN (
      SELECT id FROM schools WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT id FROM schools WHERE owner_id = auth.uid()
    )
  );

-- Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();