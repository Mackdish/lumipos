GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

INSERT INTO public.profiles (id, full_name, job_title)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
       CASE WHEN lower(u.email) = 'macknonvulimu@gmail.com' THEN 'Manager' ELSE 'Receptionist' END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
       CASE WHEN lower(u.email) = 'macknonvulimu@gmail.com' THEN 'manager'::public.app_role ELSE 'staff'::public.app_role END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);