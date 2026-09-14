-- Staff self-registration and manager approval workflow for LumiPOS.
-- New non-manager accounts are created without a user_roles row until approved.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_approval_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS profiles_approval_status_idx
  ON public.profiles (approval_status);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  assigned_role public.app_role := 'staff';
  status_value TEXT := 'pending';
  job_value TEXT := 'Cashier';
BEGIN
  -- Keep the existing owner account as the manager.
  IF lower(COALESCE(NEW.email, '')) = 'macknonvulimu@gmail.com' THEN
    assigned_role := 'manager';
    status_value := 'approved';
    job_value := 'Manager';
  END IF;

  INSERT INTO public.profiles (id, full_name, job_title, email, approval_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    job_value,
    NEW.email,
    status_value
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;

  -- Only automatically assign a role to the owner/manager.
  -- Cashiers receive their staff role only after manager approval.
  IF assigned_role = 'manager' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, assigned_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;

-- Existing accounts that already have roles remain approved. Existing profiles
-- without an approval state are treated as approved so current staff are not locked out.
UPDATE public.profiles p
SET approval_status = 'approved'
WHERE EXISTS (
  SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id
);

-- Manager can see the full staff directory. Staff retain the existing access pattern.
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
CREATE POLICY "Managers can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager') OR id = auth.uid());

-- Secure approval/rejection actions through SECURITY DEFINER functions so the
-- browser never receives permission to directly grant arbitrary roles.
CREATE OR REPLACE FUNCTION public.approve_staff_member(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Only managers can approve staff accounts';
  END IF;

  UPDATE public.profiles
  SET approval_status = 'approved', job_title = 'Cashier'
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'staff')
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_staff_member(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Only managers can reject staff accounts';
  END IF;

  UPDATE public.profiles
  SET approval_status = 'rejected'
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id AND role = 'staff';

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_staff_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_staff_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_staff_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_staff_member(UUID) TO authenticated;
