-- TillBook: prevent onboarding from depending on recursive membership RLS.
-- The authenticated user's own active membership is exposed through a
-- SECURITY DEFINER function. This is intentionally read-only.

CREATE OR REPLACE FUNCTION public.get_my_hotel_membership()
RETURNS TABLE (
  hotel_id UUID,
  role TEXT,
  status TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hm.hotel_id, hm.role, hm.status
  FROM public.hotel_memberships AS hm
  WHERE hm.user_id = auth.uid()
    AND hm.status = 'active'
  ORDER BY hm.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_hotel_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_hotel_membership() TO authenticated;

-- Keep the existing tenant RLS policy, but make the helper functions explicitly
-- owned by the database owner so they can safely resolve the user's membership.
ALTER FUNCTION public.current_hotel_id() OWNER TO postgres;
ALTER FUNCTION public.current_hotel_role() OWNER TO postgres;
ALTER FUNCTION public.get_my_hotel_membership() OWNER TO postgres;
