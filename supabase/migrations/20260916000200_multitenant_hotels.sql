-- TillBook multi-tenant hotel accounts, branding, membership and tenant isolation.
-- Existing data is migrated into one default hotel owned by the current manager.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  tagline TEXT, logo_url TEXT, primary_color TEXT NOT NULL DEFAULT '#1f7a4d', secondary_color TEXT NOT NULL DEFAULT '#f4f7f5',
  phone TEXT, email TEXT, address TEXT, currency TEXT NOT NULL DEFAULT 'KES',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hotel_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','cashier')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (hotel_id, user_id)
);
CREATE INDEX IF NOT EXISTS hotel_memberships_user_idx ON public.hotel_memberships(user_id);
CREATE INDEX IF NOT EXISTS hotel_memberships_hotel_idx ON public.hotel_memberships(hotel_id);
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_memberships ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_hotel_id() RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hotel_id FROM public.hotel_memberships WHERE user_id = auth.uid() AND status = 'active' ORDER BY created_at LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.current_hotel_role() RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.hotel_memberships WHERE user_id = auth.uid() AND status = 'active' ORDER BY created_at LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.current_hotel_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_hotel_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_hotel_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_hotel_role() TO authenticated;

DROP POLICY IF EXISTS hotel_member_select ON public.hotels;
CREATE POLICY hotel_member_select ON public.hotels FOR SELECT TO authenticated USING (id = public.current_hotel_id());
DROP POLICY IF EXISTS hotel_member_update ON public.hotels;
CREATE POLICY hotel_member_update ON public.hotels FOR UPDATE TO authenticated USING (id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager')) WITH CHECK (id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
DROP POLICY IF EXISTS hotel_membership_select ON public.hotel_memberships;
CREATE POLICY hotel_membership_select ON public.hotel_memberships FOR SELECT TO authenticated USING (hotel_id = public.current_hotel_id());
DROP POLICY IF EXISTS hotel_membership_manager_insert ON public.hotel_memberships;
CREATE POLICY hotel_membership_manager_insert ON public.hotel_memberships FOR INSERT TO authenticated WITH CHECK (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
DROP POLICY IF EXISTS hotel_membership_manager_update ON public.hotel_memberships;
CREATE POLICY hotel_membership_manager_update ON public.hotel_memberships FOR UPDATE TO authenticated USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager')) WITH CHECK (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
GRANT SELECT, UPDATE ON public.hotels TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hotel_memberships TO authenticated;

DO $$
DECLARE owner_user_id UUID; default_hotel_id UUID;
BEGIN
  SELECT user_id INTO owner_user_id FROM public.user_roles WHERE role::TEXT = 'manager' ORDER BY user_id LIMIT 1;
  IF owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hotels) THEN
    INSERT INTO public.hotels (name, slug, tagline, created_by) VALUES ('TillBook Hotel', 'tillbook-hotel', 'Hotel & restaurant operations', owner_user_id) RETURNING id INTO default_hotel_id;
    INSERT INTO public.hotel_memberships (hotel_id, user_id, role)
    SELECT default_hotel_id, ur.user_id, CASE WHEN ur.role::TEXT = 'manager' THEN 'manager' ELSE 'cashier' END FROM public.user_roles ur
    ON CONFLICT (hotel_id, user_id) DO NOTHING;
    UPDATE public.hotel_memberships SET role = 'owner' WHERE hotel_memberships.hotel_id = default_hotel_id AND hotel_memberships.user_id = owner_user_id;
  END IF;
END $$;

DO $$
DECLARE table_name TEXT; tables TEXT[] := ARRAY['menu_items','orders','order_items','inventory_items','stock_movements','recipes','recipe_ingredients','staff_shifts'];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(hotel_id)', table_name || '_hotel_idx', table_name);
    EXECUTE format('UPDATE public.%I t SET hotel_id = h.id FROM (SELECT id FROM public.hotels ORDER BY created_at LIMIT 1) h WHERE t.hotel_id IS NULL', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_business_hotel_id() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE active_hotel UUID;
BEGIN
  active_hotel := public.current_hotel_id();
  IF active_hotel IS NULL THEN RAISE EXCEPTION 'No active hotel account is associated with this user'; END IF;
  IF NEW.hotel_id IS NULL THEN NEW.hotel_id := active_hotel;
  ELSIF NEW.hotel_id <> active_hotel THEN RAISE EXCEPTION 'Cross-hotel data access is not allowed'; END IF;
  RETURN NEW;
END; $$;
DO $$
DECLARE table_name TEXT; tables TEXT[] := ARRAY['menu_items','orders','order_items','inventory_items','stock_movements','recipes','recipe_ingredients','staff_shifts'];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_set_hotel_id', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_business_hotel_id()', table_name || '_set_hotel_id', table_name);
  END LOOP;
END $$;

DO $$
DECLARE policy_row RECORD; table_name TEXT; tables TEXT[] := ARRAY['menu_items','orders','order_items','inventory_items','stock_movements','recipes','recipe_ingredients','staff_shifts'];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_row IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, table_name);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY tenant_menu_select ON public.menu_items FOR SELECT TO authenticated USING (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_menu_insert ON public.menu_items FOR INSERT TO authenticated WITH CHECK (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
CREATE POLICY tenant_menu_update ON public.menu_items FOR UPDATE TO authenticated USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager')) WITH CHECK (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
CREATE POLICY tenant_menu_delete ON public.menu_items FOR DELETE TO authenticated USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
CREATE POLICY tenant_orders_select ON public.orders FOR SELECT TO authenticated USING (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_orders_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_orders_update ON public.orders FOR UPDATE TO authenticated USING (hotel_id = public.current_hotel_id()) WITH CHECK (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_orders_delete ON public.orders FOR DELETE TO authenticated USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
CREATE POLICY tenant_order_items_select ON public.order_items FOR SELECT TO authenticated USING (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_order_items_insert ON public.order_items FOR INSERT TO authenticated WITH CHECK (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_order_items_update ON public.order_items FOR UPDATE TO authenticated USING (hotel_id = public.current_hotel_id()) WITH CHECK (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_order_items_delete ON public.order_items FOR DELETE TO authenticated USING (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_inventory_all ON public.inventory_items FOR ALL TO authenticated USING (hotel_id = public.current_hotel_id()) WITH CHECK (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_stock_all ON public.stock_movements FOR ALL TO authenticated USING (hotel_id = public.current_hotel_id()) WITH CHECK (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_recipes_all ON public.recipes FOR ALL TO authenticated USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager')) WITH CHECK (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
CREATE POLICY tenant_recipe_ingredients_all ON public.recipe_ingredients FOR ALL TO authenticated USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager')) WITH CHECK (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
CREATE POLICY tenant_shifts_select ON public.staff_shifts FOR SELECT TO authenticated USING (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_shifts_insert ON public.staff_shifts FOR INSERT TO authenticated WITH CHECK (hotel_id = public.current_hotel_id() AND user_id = auth.uid());
CREATE POLICY tenant_shifts_update ON public.staff_shifts FOR UPDATE TO authenticated USING (hotel_id = public.current_hotel_id() AND (user_id = auth.uid() OR public.current_hotel_role() IN ('owner','manager'))) WITH CHECK (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_shifts_delete ON public.staff_shifts FOR DELETE TO authenticated USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner','manager'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items, public.orders, public.order_items, public.inventory_items, public.stock_movements, public.recipes, public.recipe_ingredients, public.staff_shifts TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT) RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.hotel_memberships WHERE user_id = _user_id AND hotel_id = public.current_hotel_id() AND status = 'active' AND role IN (_role, CASE WHEN _role = 'manager' THEN 'owner' ELSE _role END));
$$;
REVOKE ALL ON FUNCTION public.has_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_hotel_profile(hotel_name TEXT, hotel_slug TEXT, hotel_tagline TEXT DEFAULT NULL, hotel_logo_url TEXT DEFAULT NULL, hotel_primary_color TEXT DEFAULT '#1f7a4d', hotel_secondary_color TEXT DEFAULT '#f4f7f5', hotel_phone TEXT DEFAULT NULL, hotel_email TEXT DEFAULT NULL, hotel_address TEXT DEFAULT NULL) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_hotel_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM public.hotel_memberships WHERE user_id = auth.uid() AND status = 'active') THEN RAISE EXCEPTION 'This account already belongs to a hotel'; END IF;
  IF length(trim(hotel_name)) < 2 THEN RAISE EXCEPTION 'Hotel name is required'; END IF;
  IF hotel_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid hotel slug'; END IF;
  IF EXISTS (SELECT 1 FROM public.hotels WHERE slug = hotel_slug) THEN RAISE EXCEPTION 'That hotel URL is already in use'; END IF;
  INSERT INTO public.hotels (name, slug, tagline, logo_url, primary_color, secondary_color, phone, email, address, created_by) VALUES (trim(hotel_name), hotel_slug, NULLIF(trim(hotel_tagline), ''), NULLIF(trim(hotel_logo_url), ''), hotel_primary_color, hotel_secondary_color, NULLIF(trim(hotel_phone), ''), NULLIF(trim(hotel_email), ''), NULLIF(trim(hotel_address), ''), auth.uid()) RETURNING id INTO new_hotel_id;
  INSERT INTO public.hotel_memberships (hotel_id, user_id, role) VALUES (new_hotel_id, auth.uid(), 'owner');
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'manager') ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET approval_status = 'approved', job_title = 'Owner' WHERE id = auth.uid();
  RETURN new_hotel_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_hotel_profile(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_profile(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_hotel_branding(hotel_name TEXT, hotel_tagline TEXT DEFAULT NULL, hotel_logo_url TEXT DEFAULT NULL, hotel_primary_color TEXT DEFAULT '#1f7a4d', hotel_secondary_color TEXT DEFAULT '#f4f7f5', hotel_phone TEXT DEFAULT NULL, hotel_email TEXT DEFAULT NULL, hotel_address TEXT DEFAULT NULL) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_hotel_role() NOT IN ('owner','manager') THEN RAISE EXCEPTION 'Manager access required'; END IF;
  UPDATE public.hotels SET name = trim(hotel_name), tagline = NULLIF(trim(hotel_tagline), ''), logo_url = NULLIF(trim(hotel_logo_url), ''), primary_color = hotel_primary_color, secondary_color = hotel_secondary_color, phone = NULLIF(trim(hotel_phone), ''), email = NULLIF(trim(hotel_email), ''), address = NULLIF(trim(hotel_address), ''), updated_at = now() WHERE id = public.current_hotel_id();
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.update_hotel_branding(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_hotel_branding(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
