/*
  # Fix handle_new_user trigger to be fault-tolerant

  The trigger was failing during signup because:
  1. Any exception in the trigger causes a 500 from Supabase Auth
  2. The profile insert could fail if school_id FK is violated or other issues

  ## Changes
  - Wrap entire trigger body in EXCEPTION handler so failures never block signup
  - Use safe casting for role with fallback
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_role_val user_role;
BEGIN
  BEGIN
    user_role_val := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'teacher'::user_role);
  EXCEPTION WHEN invalid_text_representation THEN
    user_role_val := 'teacher'::user_role;
  END;

  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, is_active)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      user_role_val,
      true
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      updated_at = now();
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
