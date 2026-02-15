/*
  # Auto Profile Creation Trigger

  Creates a profile automatically when a new user signs up via Supabase Auth.
  Also creates a default school for the user if needed.

  ## Changes
  1. Creates a trigger function that runs after a new auth.users record is inserted
  2. Automatically creates:
     - A new school for the user
     - A profile linked to that school
  3. Uses the user's email as the initial full_name

  ## Security
  - Trigger runs with SECURITY DEFINER to bypass RLS
  - Only creates records for the newly signed up user
*/

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_school_id uuid;
BEGIN
  -- Create a default school for the new user
  INSERT INTO public.schools (name, owner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || '''s School',
    NEW.id
  )
  RETURNING id INTO new_school_id;

  -- Create the profile
  INSERT INTO public.profiles (id, full_name, school_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    new_school_id,
    'teacher'
  );

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
