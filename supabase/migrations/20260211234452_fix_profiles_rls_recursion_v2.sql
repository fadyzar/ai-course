/*
  # Fix Infinite Recursion in Profiles RLS Policies
  
  ## Problem
  The existing RLS policy on profiles table causes infinite recursion because
  it queries the same table it's protecting within the USING clause.
  
  ## Solution
  1. Drop problematic policies
  2. Create a security definer function in public schema
  3. Use the function in simplified policies to avoid recursion
  
  ## Important Notes
  - The function is SECURITY DEFINER to bypass RLS when getting user's school_id
  - This is safe because it only returns data for auth.uid()
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view profiles in their school" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Create a helper function in public schema to get current user's school_id
-- Using SECURITY DEFINER to bypass RLS and avoid recursion
CREATE OR REPLACE FUNCTION public.current_user_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy: Users can view profiles in the same school
CREATE POLICY "Users can view same school profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    school_id IS NOT NULL AND
    school_id = public.current_user_school_id()
  );

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());