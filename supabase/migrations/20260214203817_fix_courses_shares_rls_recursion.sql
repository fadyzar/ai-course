/*
  # Fix Circular RLS Recursion Between Courses and Shares

  The courses and shares tables had circular RLS policies:
  - courses SELECT checked shares table
  - shares SELECT checked courses table
  This caused infinite recursion and 500 errors on any query.

  ## Changes
  1. Drop all existing policies on courses and shares
  2. Recreate courses policies using direct auth.uid() and current_user_school_id() (SECURITY DEFINER)
  3. Create a SECURITY DEFINER helper function for checking course ownership
  4. Recreate shares policies using the helper function instead of subquerying courses

  ## Security
  - All policies restricted to authenticated users
  - Ownership checks on all write operations
  - No circular dependencies between tables
*/

-- Helper function: check if a user owns a course (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.user_owns_course(p_course_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()
  );
$$;

-- Helper function: check if a course has a valid share
CREATE OR REPLACE FUNCTION public.course_has_valid_share(p_course_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM shares
    WHERE course_id = p_course_id
    AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- ==========================================
-- COURSES: Drop all existing policies
-- ==========================================
DROP POLICY IF EXISTS "Teachers can view courses in their school" ON courses;
DROP POLICY IF EXISTS "Students can view courses via share token" ON courses;
DROP POLICY IF EXISTS "Teachers can insert courses in their school" ON courses;
DROP POLICY IF EXISTS "Course owners can update their courses" ON courses;
DROP POLICY IF EXISTS "Course owners can delete their courses" ON courses;

-- COURSES: SELECT - owner or same school
CREATE POLICY "Owner can view own courses"
  ON courses FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "School members can view school courses"
  ON courses FOR SELECT
  TO authenticated
  USING (school_id = current_user_school_id());

CREATE POLICY "Shared courses are viewable"
  ON courses FOR SELECT
  TO authenticated
  USING (course_has_valid_share(id));

-- COURSES: INSERT
CREATE POLICY "Owner can insert courses"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND school_id = current_user_school_id()
  );

-- COURSES: UPDATE
CREATE POLICY "Owner can update own courses"
  ON courses FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- COURSES: DELETE
CREATE POLICY "Owner can delete own courses"
  ON courses FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ==========================================
-- SHARES: Drop all existing policies
-- ==========================================
DROP POLICY IF EXISTS "Course owners can view shares" ON shares;
DROP POLICY IF EXISTS "Course owners can create shares" ON shares;
DROP POLICY IF EXISTS "Course owners can update shares" ON shares;
DROP POLICY IF EXISTS "Course owners can delete shares" ON shares;

-- SHARES: SELECT
CREATE POLICY "Owner can view shares for own courses"
  ON shares FOR SELECT
  TO authenticated
  USING (user_owns_course(course_id));

-- SHARES: INSERT
CREATE POLICY "Owner can create shares for own courses"
  ON shares FOR INSERT
  TO authenticated
  WITH CHECK (user_owns_course(course_id));

-- SHARES: UPDATE
CREATE POLICY "Owner can update shares for own courses"
  ON shares FOR UPDATE
  TO authenticated
  USING (user_owns_course(course_id))
  WITH CHECK (user_owns_course(course_id));

-- SHARES: DELETE
CREATE POLICY "Owner can delete shares for own courses"
  ON shares FOR DELETE
  TO authenticated
  USING (user_owns_course(course_id));
