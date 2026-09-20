ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS text_color TEXT NOT NULL DEFAULT '#26383d';

DROP FUNCTION IF EXISTS public.create_hotel_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_hotel_profile(
  hotel_name TEXT,
  hotel_slug TEXT,
  hotel_tagline TEXT DEFAULT NULL,
  hotel_logo_url TEXT DEFAULT NULL,
  hotel_primary_color TEXT DEFAULT '#1f7a4d',
  hotel_secondary_color TEXT DEFAULT '#f4f7f5',
  hotel_text_color TEXT DEFAULT '#26383d',
  hotel_phone TEXT DEFAULT NULL,
  hotel_email TEXT DEFAULT NULL,
  hotel_address TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_hotel_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM public.hotel_memberships WHERE user_id = auth.uid() AND status = 'active') THEN RAISE EXCEPTION 'This account already belongs to a hotel'; END IF;
  IF length(trim(hotel_name)) < 2 THEN RAISE EXCEPTION 'Hotel name is required'; END IF;
  IF hotel_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid hotel slug'; END IF;
  IF EXISTS (SELECT 1 FROM public.hotels WHERE slug = hotel_slug) THEN RAISE EXCEPTION 'That hotel URL is already in use'; END IF;
  INSERT INTO public.hotels (name, slug, tagline, logo_url, primary_color, secondary_color, text_color, phone, email, address, created_by)
  VALUES (trim(hotel_name), hotel_slug, NULLIF(trim(hotel_tagline), ''), NULLIF(trim(hotel_logo_url), ''), hotel_primary_color, hotel_secondary_color, hotel_text_color, NULLIF(trim(hotel_phone), ''), NULLIF(trim(hotel_email), ''), NULLIF(trim(hotel_address), ''), auth.uid())
  RETURNING id INTO new_hotel_id;
  INSERT INTO public.hotel_memberships (hotel_id, user_id, role) VALUES (new_hotel_id, auth.uid(), 'owner');
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'manager') ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET approval_status = 'approved', job_title = 'Owner' WHERE id = auth.uid();
  RETURN new_hotel_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_hotel_profile(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_profile(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.update_hotel_branding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.update_hotel_branding(
  hotel_name TEXT,
  hotel_tagline TEXT DEFAULT NULL,
  hotel_logo_url TEXT DEFAULT NULL,
  hotel_primary_color TEXT DEFAULT '#1f7a4d',
  hotel_secondary_color TEXT DEFAULT '#f4f7f5',
  hotel_text_color TEXT DEFAULT '#26383d',
  hotel_phone TEXT DEFAULT NULL,
  hotel_email TEXT DEFAULT NULL,
  hotel_address TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_hotel_role() NOT IN ('owner','manager') THEN RAISE EXCEPTION 'Manager access required'; END IF;
  UPDATE public.hotels
  SET name = trim(hotel_name), tagline = NULLIF(trim(hotel_tagline), ''), logo_url = NULLIF(trim(hotel_logo_url), ''), primary_color = hotel_primary_color, secondary_color = hotel_secondary_color, text_color = hotel_text_color, phone = NULLIF(trim(hotel_phone), ''), email = NULLIF(trim(hotel_email), ''), address = NULLIF(trim(hotel_address), ''), updated_at = now()
  WHERE id = public.current_hotel_id();
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.update_hotel_branding(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_hotel_branding(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;