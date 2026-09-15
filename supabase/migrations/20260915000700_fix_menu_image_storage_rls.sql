-- LumiPOS: fix menu image uploads
-- Managers can upload, update and remove files in the menu-images bucket.
-- Public read access is required because menu image URLs are public.

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('menu-images', 'menu-images', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
END $$;

DROP POLICY IF EXISTS "Public can view menu images" ON storage.objects;
CREATE POLICY "Public can view menu images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "Managers can upload menu images" ON storage.objects;
CREATE POLICY "Managers can upload menu images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'menu-images'
  AND public.has_role(auth.uid(), 'manager')
);

DROP POLICY IF EXISTS "Managers can update menu images" ON storage.objects;
CREATE POLICY "Managers can update menu images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'menu-images'
  AND public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  bucket_id = 'menu-images'
  AND public.has_role(auth.uid(), 'manager')
);

DROP POLICY IF EXISTS "Managers can delete menu images" ON storage.objects;
CREATE POLICY "Managers can delete menu images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'menu-images'
  AND public.has_role(auth.uid(), 'manager')
);

GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
