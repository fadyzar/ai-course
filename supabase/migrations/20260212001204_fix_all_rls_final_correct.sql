/*
  # Complete RLS Fix - Final Correct Version
  
  ## Solution
  1. Make school_id nullable on courses
  2. Remove ALL existing policies
  3. Create simple, clean policies based on actual table structures
  
  ## Tables and Their Columns
  - profiles: id, role, full_name, school_id, avatar_url
  - schools: id, name, owner_id
  - courses: id, school_id (nullable now), owner_id, title, description, status
  - shares: id, course_id, share_token, expires_at
  - course_assets: id, course_id, file_type, storage_path
  - course_sections: id, course_id, title, order_index
  - course_pages: id, course_id, section_id, content
  - questions: id, course_id, question_text, options
  - answers: id, attempt_id, question_id, selected_options
  - attempts: id, course_id, student_identifier
  - jobs: id, course_id, job_type, status
  - processing_logs: id, job_id, level, message
  - integrations: id, school_id, provider, config
*/

-- Step 1: Make school_id nullable on courses
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'courses' 
        AND column_name = 'school_id' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE courses ALTER COLUMN school_id DROP NOT NULL;
    END IF;
END $$;

-- Step 2: Drop ALL existing policies
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
            r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- Step 3: Create clean policies

-- PROFILES
CREATE POLICY "profiles_all_own" ON profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- SCHOOLS
CREATE POLICY "schools_all_own" ON schools FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- COURSES
CREATE POLICY "courses_select" ON courses FOR SELECT TO authenticated, anon
  USING (
    owner_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM shares WHERE shares.course_id = courses.id AND (shares.expires_at IS NULL OR shares.expires_at > now()))
  );

CREATE POLICY "courses_insert" ON courses FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "courses_update" ON courses FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "courses_delete" ON courses FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- SHARES
CREATE POLICY "shares_select" ON shares FOR SELECT TO authenticated, anon
  USING (expires_at IS NULL OR expires_at > now());

CREATE POLICY "shares_all_owner" ON shares FOR ALL TO authenticated
  USING (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()))
  WITH CHECK (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()));

-- COURSE_ASSETS
CREATE POLICY "course_assets_select" ON course_assets FOR SELECT TO authenticated, anon
  USING (
    course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid())
    OR course_id IN (SELECT course_id FROM shares WHERE expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY "course_assets_manage" ON course_assets FOR ALL TO authenticated
  USING (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()))
  WITH CHECK (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()));

-- COURSE_SECTIONS
CREATE POLICY "course_sections_select" ON course_sections FOR SELECT TO authenticated, anon
  USING (
    course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid())
    OR course_id IN (SELECT course_id FROM shares WHERE expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY "course_sections_manage" ON course_sections FOR ALL TO authenticated
  USING (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()))
  WITH CHECK (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()));

-- COURSE_PAGES
CREATE POLICY "course_pages_select" ON course_pages FOR SELECT TO authenticated, anon
  USING (
    course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid())
    OR course_id IN (SELECT course_id FROM shares WHERE expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY "course_pages_manage" ON course_pages FOR ALL TO authenticated
  USING (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()))
  WITH CHECK (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()));

-- QUESTIONS
CREATE POLICY "questions_select" ON questions FOR SELECT TO authenticated, anon
  USING (
    course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid())
    OR course_id IN (SELECT course_id FROM shares WHERE expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY "questions_manage" ON questions FOR ALL TO authenticated
  USING (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()))
  WITH CHECK (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()));

-- ANSWERS (public can answer questions)
CREATE POLICY "answers_select" ON answers FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "answers_insert" ON answers FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- ATTEMPTS (public can create attempts)
CREATE POLICY "attempts_select" ON attempts FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "attempts_insert" ON attempts FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "attempts_update" ON attempts FOR UPDATE TO authenticated, anon
  USING (true) WITH CHECK (true);

-- JOBS
CREATE POLICY "jobs_manage" ON jobs FOR ALL TO authenticated
  USING (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()))
  WITH CHECK (course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid()));

-- PROCESSING_LOGS
CREATE POLICY "processing_logs_manage" ON processing_logs FOR ALL TO authenticated
  USING (job_id IN (SELECT id FROM jobs WHERE course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid())))
  WITH CHECK (job_id IN (SELECT id FROM jobs WHERE course_id IN (SELECT id FROM courses WHERE owner_id = auth.uid())));

-- INTEGRATIONS
CREATE POLICY "integrations_manage" ON integrations FOR ALL TO authenticated
  USING (school_id IN (SELECT id FROM schools WHERE owner_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT id FROM schools WHERE owner_id = auth.uid()));

-- Reload schema
NOTIFY pgrst, 'reload schema';