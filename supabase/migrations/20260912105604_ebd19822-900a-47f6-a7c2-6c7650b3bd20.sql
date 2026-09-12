REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;