-- TillBook: close remaining cross-tenant access paths for profiles and roles.

DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY tenant_profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.hotel_memberships hm
    WHERE hm.hotel_id = public.current_hotel_id()
      AND hm.user_id = profiles.id
      AND hm.status = 'active'
      AND public.current_hotel_role() IN ('owner','manager')
  )
);

-- Keep user_roles compatible with the existing application while preventing
-- users from seeing roles belonging to another hotel's staff.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE;

UPDATE public.user_roles ur
SET hotel_id = hm.hotel_id
FROM public.hotel_memberships hm
WHERE hm.user_id = ur.user_id
  AND ur.hotel_id IS NULL;

CREATE INDEX IF NOT EXISTS user_roles_hotel_idx ON public.user_roles(hotel_id);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', p.policyname);
  END LOOP;
END $$;

CREATE POLICY tenant_user_roles_select ON public.user_roles
FOR SELECT TO authenticated
USING (hotel_id = public.current_hotel_id() OR user_id = auth.uid());

CREATE POLICY tenant_user_roles_manager_insert ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));

CREATE POLICY tenant_user_roles_manager_update ON public.user_roles
FOR UPDATE TO authenticated
USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'))
WITH CHECK (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));

CREATE POLICY tenant_user_roles_manager_delete ON public.user_roles
FOR DELETE TO authenticated
USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- Make the compatibility role helper prefer the tenant membership and never
-- authorize a user from a different hotel through an old global role row.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hotel_memberships
    WHERE user_id = _user_id
      AND hotel_id = public.current_hotel_id()
      AND status = 'active'
      AND role IN (_role, CASE WHEN _role = 'manager' THEN 'owner' ELSE _role END)
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;

-- The cashier Edge Function inserts the legacy role row after membership creation.
-- This helper keeps its tenant_id populated if a trusted insert omits it.
CREATE OR REPLACE FUNCTION public.set_user_role_hotel_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hotel_id IS NULL THEN
    SELECT public.current_hotel_id() INTO NEW.hotel_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_roles_set_hotel_id ON public.user_roles;
CREATE TRIGGER user_roles_set_hotel_id
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.set_user_role_hotel_id();
