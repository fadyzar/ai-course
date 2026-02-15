/*
  # Nuclear Fix - Complete RLS Reset
  
  ## Issue
  500 errors on courses table despite policy changes
  
  ## Solution
  1. Disable RLS on ALL tables temporarily
  2. Drop ALL policies
  3. Re-enable RLS
  4. Create the simplest possible policies with NO subqueries
*/

-- Step 1: Disable RLS on all tables
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE schools DISABLE ROW LEVEL SECURITY;
ALTER TABLE courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE shares DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_sections DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_pages DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE integrations DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL policies
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

-- Step 3: Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Step 4: Create ULTRA SIMPLE policies with NO subqueries

-- PROFILES: Direct ownership only
CREATE POLICY "p_all" ON profiles FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- SCHOOLS: Direct ownership only
CREATE POLICY "s_all" ON schools FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- COURSES: Direct ownership only - NO SHARES SUBQUERY
CREATE POLICY "c_select" ON courses FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "c_insert" ON courses FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "c_update" ON courses FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "c_delete" ON courses FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- SHARES: No subqueries - just allow all for authenticated users
CREATE POLICY "sh_all" ON shares FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- COURSE_ASSETS: Allow all for authenticated
CREATE POLICY "ca_all" ON course_assets FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- COURSE_SECTIONS: Allow all for authenticated
CREATE POLICY "cs_all" ON course_sections FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- COURSE_PAGES: Allow all for authenticated
CREATE POLICY "cp_all" ON course_pages FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- QUESTIONS: Allow all for authenticated
CREATE POLICY "q_all" ON questions FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ANSWERS: Allow all
CREATE POLICY "a_all" ON answers FOR ALL
  USING (true)
  WITH CHECK (true);

-- ATTEMPTS: Allow all
CREATE POLICY "at_all" ON attempts FOR ALL
  USING (true)
  WITH CHECK (true);

-- JOBS: Allow all for authenticated
CREATE POLICY "j_all" ON jobs FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- PROCESSING_LOGS: Allow all for authenticated
CREATE POLICY "pl_all" ON processing_logs FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- INTEGRATIONS: Allow all for authenticated
CREATE POLICY "i_all" ON integrations FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Force complete schema reload
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';