CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  assigned_role public.app_role := 'staff';
BEGIN
  IF lower(NEW.email) = 'macknonvulimu@gmail.com' THEN
    assigned_role := 'manager';
  END IF;

  INSERT INTO public.profiles (id, full_name, job_title)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN assigned_role = 'manager' THEN 'Manager' ELSE 'Receptionist' END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();