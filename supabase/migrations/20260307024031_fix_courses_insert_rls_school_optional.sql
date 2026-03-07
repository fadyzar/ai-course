/*
  # Fix courses INSERT RLS policy - school_id is optional

  ## Problem
  The current INSERT policy requires school_id to match current_user_school_id().
  This fails for teachers who don't belong to a school (school_id is null).

  ## Fix
  Update the WITH CHECK to allow INSERT when:
  - owner_id matches the authenticated user, AND
  - Either school_id is null, OR school_id matches the user's school
*/

DROP POLICY IF EXISTS "Owner can insert courses" ON courses;

CREATE POLICY "Owner can insert courses"
  ON courses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      school_id IS NULL
      OR school_id = current_user_school_id()
    )
  );
