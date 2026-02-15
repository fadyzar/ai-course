/*
  # Simplify RLS to Owner-Based Access
  
  ## Problem
  Using school_id for multi-tenant isolation creates circular dependencies
  because we need to query profiles table to get the user's school_id,
  but profiles itself has RLS policies.
  
  ## Solution
  Simplify to owner-based access control:
  - Users can only access resources they own (owner_id = auth.uid())
  - Share tokens provide public access to courses
  - Remove school_id checks from RLS policies
  
  This eliminates the recursion issue while maintaining security.
  Future: For true multi-user schools, use JWT claims or a separate approach.
*/

-- Update courses policies to be owner-based only
DROP POLICY IF EXISTS "Teachers can view courses in their school" ON courses;
DROP POLICY IF EXISTS "Teachers can insert courses in their school" ON courses;

CREATE POLICY "courses_select_owned_or_shared"
  ON courses FOR SELECT
  TO authenticated, anon
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM shares
      WHERE shares.course_id = courses.id
      AND (shares.expires_at IS NULL OR shares.expires_at > now())
    )
  );

CREATE POLICY "courses_insert_owned"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Update course_assets policies to be owner-based
DROP POLICY IF EXISTS "Teachers can view assets of their school's courses" ON course_assets;

CREATE POLICY "course_assets_select_owned"
  ON course_assets FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

-- Update course_sections to be owner-based
DROP POLICY IF EXISTS "Anyone can view sections of shared courses" ON course_sections;

CREATE POLICY "course_sections_select_owned_or_shared"
  ON course_sections FOR SELECT
  TO authenticated, anon
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    ) OR
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    )
  );

-- Update course_pages to be owner-based
DROP POLICY IF EXISTS "Anyone can view pages of shared courses" ON course_pages;

CREATE POLICY "course_pages_select_owned_or_shared"
  ON course_pages FOR SELECT
  TO authenticated, anon
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    ) OR
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    )
  );

-- Update questions to be owner-based
DROP POLICY IF EXISTS "Anyone can view questions of shared courses" ON questions;

CREATE POLICY "questions_select_owned_or_shared"
  ON questions FOR SELECT
  TO authenticated, anon
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    ) OR
    course_id IN (
      SELECT course_id FROM shares
      WHERE expires_at IS NULL OR expires_at > now()
    )
  );

-- Update jobs to be owner-based
DROP POLICY IF EXISTS "Teachers can view jobs for their courses" ON jobs;

CREATE POLICY "jobs_select_owned"
  ON jobs FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT id FROM courses WHERE owner_id = auth.uid()
    )
  );

-- Update processing_logs to be owner-based
DROP POLICY IF EXISTS "Teachers can view logs for their courses" ON processing_logs;

CREATE POLICY "processing_logs_select_owned"
  ON processing_logs FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE course_id IN (
        SELECT id FROM courses WHERE owner_id = auth.uid()
      )
    )
  );

-- Update schools policy
DROP POLICY IF EXISTS "Users can view their own school" ON schools;

CREATE POLICY "schools_select_owned"
  ON schools FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- Update integrations to be owner-based
DROP POLICY IF EXISTS "School members can view their integrations" ON integrations;
DROP POLICY IF EXISTS "School owners can manage integrations" ON integrations;

CREATE POLICY "integrations_select_owned"
  ON integrations FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT id FROM schools WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "integrations_manage_owned"
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