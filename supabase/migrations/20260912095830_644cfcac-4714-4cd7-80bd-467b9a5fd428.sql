
-- roles
CREATE TYPE public.app_role AS ENUM ('manager','staff');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'Staff member',
  job_title TEXT NOT NULL DEFAULT 'Receptionist',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'staff',
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- menu
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view menu" ON public.menu_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers manage menu" ON public.menu_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

-- orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL NOT NULL,
  customer TEXT NOT NULL DEFAULT 'Walk-in customer',
  employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL DEFAULT 'Staff member',
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  order_status TEXT NOT NULL DEFAULT 'PENDING',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = employee_id);
CREATE POLICY "Own or manager update orders" ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = employee_id OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (auth.uid() = employee_id OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Own or manager delete orders" ON public.orders FOR DELETE TO authenticated
  USING (auth.uid() = employee_id OR public.has_role(auth.uid(), 'manager'));

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view order items" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff add order items" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.employee_id = auth.uid() OR public.has_role(auth.uid(), 'manager'))));
CREATE POLICY "Own or manager modify order items" ON public.order_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.employee_id = auth.uid() OR public.has_role(auth.uid(), 'manager'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.employee_id = auth.uid() OR public.has_role(auth.uid(), 'manager'))));
CREATE POLICY "Own or manager remove order items" ON public.order_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.employee_id = auth.uid() OR public.has_role(auth.uid(), 'manager'))));

CREATE INDEX orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX order_items_order_id_idx ON public.order_items (order_id);

-- seed menu
INSERT INTO public.menu_items (name, category, price) VALUES
  ('Grilled Chicken','Mains',650),
  ('Beef Pilau','Mains',450),
  ('Chips','Sides',180),
  ('Fresh Juice','Drinks',150),
  ('Soda','Drinks',100),
  ('Chapati','Sides',60);

-- seed sample orders
INSERT INTO public.orders (id, customer, employee_name, payment_method, payment_status, order_status, total, approved_by, approved_at, created_at) VALUES
  ('11111111-1111-4111-8111-111111111101','Walk-in customer','Jane W.','M-Pesa','PENDING','PREPARING',1480,NULL,NULL, now() - interval '2 hours'),
  ('11111111-1111-4111-8111-111111111102','Room 12','Brian K.','Cash','PAID','COMPLETED',1200,'Brian K.', now() - interval '3 hours', now() - interval '3 hours'),
  ('11111111-1111-4111-8111-111111111103','Walk-in customer','Jane W.','M-Pesa','PAID','COMPLETED',850,'Jane W.', now() - interval '5 hours', now() - interval '5 hours'),
  ('11111111-1111-4111-8111-111111111104','Room 08','Brian K.','Cash','PAID','COMPLETED',480,'Brian K.', now() - interval '6 hours', now() - interval '6 hours');

INSERT INTO public.order_items (order_id, name, quantity, price) VALUES
  ('11111111-1111-4111-8111-111111111101','Grilled Chicken',2,650),
  ('11111111-1111-4111-8111-111111111101','Chips',1,180),
  ('11111111-1111-4111-8111-111111111102','Beef Pilau',2,450),
  ('11111111-1111-4111-8111-111111111102','Fresh Juice',2,150),
  ('11111111-1111-4111-8111-111111111103','Grilled Chicken',1,650),
  ('11111111-1111-4111-8111-111111111103','Soda',2,100),
  ('11111111-1111-4111-8111-111111111104','Chips',2,180),
  ('11111111-1111-4111-8111-111111111104','Chapati',2,60);
