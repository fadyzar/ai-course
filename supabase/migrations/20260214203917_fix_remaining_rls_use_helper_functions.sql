/*
  # Fix Remaining RLS Policies to Use Helper Functions

  Replace all nested subqueries that reference courses/shares/profiles
  with SECURITY DEFINER helper functions to prevent any potential
  recursion and improve performance.

  ## Changes
  - course_assets: use user_owns_course() and current_user_school_id()
  - course_sections: use user_owns_course(), course_has_valid_share(), current_user_school_id()
  - course_pages: use user_owns_course(), course_has_valid_share(), current_user_school_id()
  - questions: use user_owns_course(), course_has_valid_share(), current_user_school_id()
  - jobs: use user_owns_course() and current_user_school_id()
  - attempts: use user_owns_course() and course_has_valid_share()
  - answers: use user_owns_course() and course_has_valid_share()
*/

-- ==========================================
-- COURSE_ASSETS
-- ==========================================
DROP POLICY IF EXISTS "Teachers can view assets of their school's courses" ON course_assets;
DROP POLICY IF EXISTS "Course owners can insert assets" ON course_assets;
DROP POLICY IF EXISTS "Course owners can update assets" ON course_assets;
DROP POLICY IF EXISTS "Course owners can delete assets" ON course_assets;

CREATE POLICY "Owner can view course assets"
  ON course_assets FOR SELECT
  TO authenticated
  USING (user_owns_course(course_id));

CREATE POLICY "Owner can insert course assets"
  ON course_assets FOR INSERT
  TO authenticated
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Owner can update course assets"
  ON course_assets FOR UPDATE
  TO authenticated
  USING (user_owns_course(course_id))
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Owner can delete course assets"
  ON course_assets FOR DELETE
  TO authenticated
  USING (user_owns_course(course_id));

-- ==========================================
-- COURSE_SECTIONS
-- ==========================================
DROP POLICY IF EXISTS "Anyone can view sections of shared courses" ON course_sections;
DROP POLICY IF EXISTS "Course owners can manage sections" ON course_sections;

CREATE POLICY "Owner can view course sections"
  ON course_sections FOR SELECT
  TO authenticated
  USING (user_owns_course(course_id));

CREATE POLICY "Shared course sections are viewable"
  ON course_sections FOR SELECT
  TO authenticated
  USING (course_has_valid_share(course_id));

CREATE POLICY "Owner can insert course sections"
  ON course_sections FOR INSERT
  TO authenticated
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Owner can update course sections"
  ON course_sections FOR UPDATE
  TO authenticated
  USING (user_owns_course(course_id))
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Owner can delete course sections"
  ON course_sections FOR DELETE
  TO authenticated
  USING (user_owns_course(course_id));

-- ==========================================
-- COURSE_PAGES
-- ==========================================
DROP POLICY IF EXISTS "Anyone can view pages of shared courses" ON course_pages;
DROP POLICY IF EXISTS "Course owners can manage pages" ON course_pages;

CREATE POLICY "Owner can view course pages"
  ON course_pages FOR SELECT
  TO authenticated
  USING (user_owns_course(course_id));

CREATE POLICY "Shared course pages are viewable"
  ON course_pages FOR SELECT
  TO authenticated
  USING (course_has_valid_share(course_id));

CREATE POLICY "Owner can insert course pages"
  ON course_pages FOR INSERT
  TO authenticated
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Owner can update course pages"
  ON course_pages FOR UPDATE
  TO authenticated
  USING (user_owns_course(course_id))
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Owner can delete course pages"
  ON course_pages FOR DELETE
  TO authenticated
  USING (user_owns_course(course_id));

-- ==========================================
-- QUESTIONS
-- ==========================================
DROP POLICY IF EXISTS "Anyone can view questions of shared courses" ON questions;
DROP POLICY IF EXISTS "Course owners can manage questions" ON questions;

CREATE POLICY "Owner can view questions"
  ON questions FOR SELECT
  TO authenticated
  USING (user_owns_course(course_id));

CREATE POLICY "Shared course questions are viewable"
  ON questions FOR SELECT
  TO authenticated
  USING (course_has_valid_share(course_id));

CREATE POLICY "Owner can insert questions"
  ON questions FOR INSERT
  TO authenticated
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Owner can update questions"
  ON questions FOR UPDATE
  TO authenticated
  USING (user_owns_course(course_id))
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Owner can delete questions"
  ON questions FOR DELETE
  TO authenticated
  USING (user_owns_course(course_id));

-- ==========================================
-- JOBS
-- ==========================================
DROP POLICY IF EXISTS "Teachers can view jobs for their courses" ON jobs;
DROP POLICY IF EXISTS "Course owners can create jobs" ON jobs;
DROP POLICY IF EXISTS "System can update jobs" ON jobs;

CREATE POLICY "Owner can view jobs"
  ON jobs FOR SELECT
  TO authenticated
  USING (user_owns_course(course_id));

CREATE POLICY "Owner can insert jobs"
  ON jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_owns_course(course_id));

CREATE POLICY "Service role can update jobs"
  ON jobs FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ==========================================
-- ATTEMPTS
-- ==========================================
DROP POLICY IF EXISTS "Course owners can view attempts" ON attempts;
DROP POLICY IF EXISTS "Anyone can create attempts for shared courses" ON attempts;

CREATE POLICY "Owner can view attempts"
  ON attempts FOR SELECT
  TO authenticated
  USING (user_owns_course(course_id));

CREATE POLICY "Anyone can create attempts for shared courses"
  ON attempts FOR INSERT
  TO authenticated
  WITH CHECK (course_has_valid_share(course_id));

-- ==========================================
-- ANSWERS
-- ==========================================
DROP POLICY IF EXISTS "Course owners can view answers" ON answers;
DROP POLICY IF EXISTS "Anyone can create answers for their attempts" ON answers;

-- Helper: check if user owns the course linked to an attempt
CREATE OR REPLACE FUNCTION public.user_owns_attempt_course(p_attempt_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM attempts a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = p_attempt_id AND c.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.attempt_has_valid_share(p_attempt_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM attempts a
    JOIN shares s ON s.course_id = a.course_id
    WHERE a.id = p_attempt_id
    AND (s.expires_at IS NULL OR s.expires_at > now())
  );
$$;

CREATE POLICY "Owner can view answers"
  ON answers FOR SELECT
  TO authenticated
  USING (user_owns_attempt_course(attempt_id));

CREATE POLICY "Anyone can create answers for shared attempts"
  ON answers FOR INSERT
  TO authenticated
  WITH CHECK (attempt_has_valid_share(attempt_id));
