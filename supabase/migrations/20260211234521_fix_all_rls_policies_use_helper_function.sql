/*
  # Fix All RLS Policies to Use Helper Function
  
  ## Problem
  Multiple tables have policies that query the profiles table, which could
  cause issues when combined with the profiles RLS policies.
  
  ## Solution
  Update all policies to use the public.current_user_school_id() helper function
  instead of subqueries to profiles table.
  
  ## Tables Updated
  - schools
  - courses
  - course_assets
  - course_sections
  - course_pages
  - questions
  - jobs
  - processing_logs
  - integrations
*/

-- Drop and recreate schools policies
DROP POLICY IF EXISTS "Users can view their own school" ON schools;

CREATE POLICY "Users can view their own school"
  ON schools FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    id = public.current_user_school_id()
  );

-- Drop and recreate courses policies
DROP POLICY IF EXISTS "Teachers can view courses in their school" ON courses;

CREATE POLICY "Teachers can view courses in their school"
  ON courses FOR SELECT
  TO authenticated
  USING (
    school_id = public.current_user_school_id()
  );

DROP POLICY IF EXISTS "Teachers can insert courses in their school" ON courses;

CREATE POLICY "Teachers can insert courses in their school"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid() AND
    school_id = public.current_user_school_id()
  );

-- Drop and recreate course_assets policies
DROP POLICY IF EXISTS "Teachers can view assets of their school's courses" ON course_assets;

CREATE POLICY "Teachers can view assets of their school's courses"
  ON course_assets FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE school_id = public.current_user_school_id()
    )
  );

-- Drop and recreate course_sections policies
DROP POLICY IF EXISTS "Anyone can view sections of shared courses" ON course_sections;

CREATE POLICY "Anyone can view sections of shared courses"
  ON course_sections FOR SELECT
  TO anon, authenticated
  USING (
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    ) OR
    course_id IN (
      SELECT id FROM courses WHERE school_id = public.current_user_school_id()
    )
  );

-- Drop and recreate course_pages policies
DROP POLICY IF EXISTS "Anyone can view pages of shared courses" ON course_pages;

CREATE POLICY "Anyone can view pages of shared courses"
  ON course_pages FOR SELECT
  TO anon, authenticated
  USING (
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    ) OR
    course_id IN (
      SELECT id FROM courses WHERE school_id = public.current_user_school_id()
    )
  );

-- Drop and recreate questions policies
DROP POLICY IF EXISTS "Anyone can view questions of shared courses" ON questions;

CREATE POLICY "Anyone can view questions of shared courses"
  ON questions FOR SELECT
  TO anon, authenticated
  USING (
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    ) OR
    course_id IN (
      SELECT id FROM courses WHERE school_id = public.current_user_school_id()
    )
  );

-- Drop and recreate jobs policies
DROP POLICY IF EXISTS "Teachers can view jobs for their courses" ON jobs;

CREATE POLICY "Teachers can view jobs for their courses"
  ON jobs FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE school_id = public.current_user_school_id()
    )
  );

-- Drop and recreate processing_logs policies
DROP POLICY IF EXISTS "Teachers can view logs for their courses" ON processing_logs;

CREATE POLICY "Teachers can view logs for their courses"
  ON processing_logs FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE course_id IN (
        SELECT id FROM courses WHERE school_id = public.current_user_school_id()
      )
    )
  );

-- Drop and recreate integrations policies
DROP POLICY IF EXISTS "School members can view their integrations" ON integrations;

CREATE POLICY "School members can view their integrations"
  ON integrations FOR SELECT
  TO authenticated
  USING (
    school_id = public.current_user_school_id()
  );

DROP POLICY IF EXISTS "School owners can manage integrations" ON integrations;

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