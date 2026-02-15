/*
  # Final Fix for Profiles RLS Infinite Recursion
  
  ## Problem
  Old policies still exist that contain subqueries to the profiles table itself,
  causing infinite recursion.
  
  ## Solution
  1. Drop ALL existing policies on profiles
  2. Create simple, non-recursive policies
  3. For viewing other profiles, don't use RLS - let the application handle it
  
  ## New Approach
  - Users can only view/update/delete their own profile via RLS
  - If we need to fetch other users' profiles (e.g., for displaying team members),
    we'll do it through a SECURITY DEFINER function or server-side logic
  
  This keeps RLS simple and prevents any possibility of recursion.
*/

-- Drop ALL existing policies on profiles
DROP POLICY IF EXISTS "Users can view profiles in their school" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view same school profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Allow users to view own profile only" ON profiles;
DROP POLICY IF EXISTS "Allow users to update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow users to insert own profile" ON profiles;
DROP POLICY IF EXISTS "Allow users to delete own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in same school" ON profiles;

-- Create simple, non-recursive policies

-- SELECT: Users can ONLY view their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- INSERT: Users can ONLY insert their own profile
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- UPDATE: Users can ONLY update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- DELETE: Users can ONLY delete their own profile
CREATE POLICY "profiles_delete_own"
  ON profiles FOR DELETE
  TO authenticated
  USING (id = auth.uid());

-- Create a safe function to get profiles by school_id
-- This bypasses RLS so it won't cause recursion
CREATE OR REPLACE FUNCTION public.get_school_profiles(target_school_id uuid)
RETURNS TABLE (
  id uuid,
  role user_role,
  full_name text,
  school_id uuid,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.role,
    p.full_name,
    p.school_id,
    p.avatar_url,
    p.created_at,
    p.updated_at
  FROM profiles p
  WHERE p.school_id = target_school_id;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_school_profiles(uuid) TO authenticated;