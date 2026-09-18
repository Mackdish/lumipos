-- TillBook: definitive menu image Storage RLS fix.
-- The previous policies depended on public.has_role(). This migration uses a
-- dedicated SECURITY DEFINER check so Storage RLS is not affected by RLS on
-- public.user_roles or by the existing has_role() overload.

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('menu-images', 'menu-images', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
END $$;

CREATE OR REPLACE FUNCTION public.is_manager_for_storage()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::TEXT = 'manager'
  );
$$;

REVOKE ALL ON FUNCTION public.is_manager_for_storage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager_for_storage() TO authenticated;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view menu images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete menu images" ON storage.objects;

CREATE POLICY "TillBook public menu image read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'menu-images');

CREATE POLICY "TillBook manager menu image upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'menu-images'
  AND public.is_manager_for_storage()
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

CREATE POLICY "TillBook manager menu image update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'menu-images'
  AND public.is_manager_for_storage()
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
)
WITH CHECK (
  bucket_id = 'menu-images'
  AND public.is_manager_for_storage()
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

CREATE POLICY "TillBook manager menu image delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'menu-images'
  AND public.is_manager_for_storage()
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
