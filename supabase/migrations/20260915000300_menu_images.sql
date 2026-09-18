-- TillBook menu images.
-- Managers upload menu photos; cashiers can read them through a public bucket.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Anyone can view menu images" ON storage.objects;
CREATE POLICY "Anyone can view menu images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "Managers can upload menu images" ON storage.objects;
CREATE POLICY "Managers can upload menu images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'menu-images'
    AND public.has_role(auth.uid(), 'manager')
  );

DROP POLICY IF EXISTS "Managers can update menu images" ON storage.objects;
CREATE POLICY "Managers can update menu images"
  ON storage.objects FOR UPDATE
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
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND public.has_role(auth.uid(), 'manager')
  );
