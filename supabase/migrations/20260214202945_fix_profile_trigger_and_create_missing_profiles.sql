/*
  # Fix Profile Auto-Creation

  1. Recreates the trigger function for automatic profile creation on signup
  2. Creates the trigger on auth.users table
  3. Creates missing profiles for existing users who don't have one
  4. Creates missing schools for those users

  ## Changes
  - Recreate handle_new_user() function with SECURITY DEFINER
  - Recreate on_auth_user_created trigger
  - Backfill missing profiles for existing auth users
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
  INSERT INTO public.schools (name, owner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s School',
    NEW.id
  )
  RETURNING id INTO new_school_id;

  INSERT INTO public.profiles (id, full_name, school_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
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

-- Backfill: create profiles for any existing users who don't have one
DO $$
DECLARE
  u RECORD;
  new_school_id uuid;
BEGIN
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    INSERT INTO public.schools (name, owner_id)
    VALUES (
      COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) || '''s School',
      u.id
    )
    RETURNING id INTO new_school_id;

    INSERT INTO public.profiles (id, full_name, school_id, role)
    VALUES (
      u.id,
      COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
      new_school_id,
      'teacher'
    );

    RAISE NOTICE 'Created profile for user %', u.email;
  END LOOP;
END $$;
