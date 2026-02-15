/*
  # Fix Processing Logs RLS

  Replace nested subquery policy with a SECURITY DEFINER helper function
  to avoid potential recursion and improve performance.

  ## Changes
  - Drop old nested policy
  - Create helper function user_owns_job_course
  - Create new simple policy using the helper
*/

CREATE OR REPLACE FUNCTION public.user_owns_job_course(p_job_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jobs j
    JOIN courses c ON c.id = j.course_id
    WHERE j.id = p_job_id AND c.owner_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Teachers can view logs for their courses" ON processing_logs;

CREATE POLICY "Owner can view processing logs"
  ON processing_logs FOR SELECT
  TO authenticated
  USING (user_owns_job_course(job_id));
