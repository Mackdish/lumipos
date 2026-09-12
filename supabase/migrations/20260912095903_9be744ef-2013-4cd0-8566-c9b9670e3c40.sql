
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY "Managers manage menu" ON public.menu_items;
CREATE POLICY "Managers manage menu" ON public.menu_items FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'manager')) WITH CHECK (private.has_role(auth.uid(), 'manager'));

DROP POLICY "Own or manager update orders" ON public.orders;
CREATE POLICY "Own or manager update orders" ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = employee_id OR private.has_role(auth.uid(), 'manager'))
  WITH CHECK (auth.uid() = employee_id OR private.has_role(auth.uid(), 'manager'));

DROP POLICY "Own or manager delete orders" ON public.orders;
CREATE POLICY "Own or manager delete orders" ON public.orders FOR DELETE TO authenticated
  USING (auth.uid() = employee_id OR private.has_role(auth.uid(), 'manager'));

DROP POLICY "Staff add order items" ON public.order_items;
CREATE POLICY "Staff add order items" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.employee_id = auth.uid() OR private.has_role(auth.uid(), 'manager'))));

DROP POLICY "Own or manager modify order items" ON public.order_items;
CREATE POLICY "Own or manager modify order items" ON public.order_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.employee_id = auth.uid() OR private.has_role(auth.uid(), 'manager'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.employee_id = auth.uid() OR private.has_role(auth.uid(), 'manager'))));

DROP POLICY "Own or manager remove order items" ON public.order_items;
CREATE POLICY "Own or manager remove order items" ON public.order_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.employee_id = auth.uid() OR private.has_role(auth.uid(), 'manager'))));

DROP FUNCTION public.has_role(uuid, public.app_role);
