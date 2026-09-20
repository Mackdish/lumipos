-- Immutable, tenant-scoped money-out records with database-enforced approval.
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  shift_id UUID REFERENCES public.staff_shifts(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('Cash', 'M-Pesa')),
  refunded_to TEXT NOT NULL CHECK (length(trim(refunded_to)) >= 2),
  reason_category TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
  authorized_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  authorized_by_name TEXT NOT NULL,
  authorization_role TEXT NOT NULL CHECK (authorization_role IN ('manager', 'supervisor')),
  recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.staff_shifts(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('Cash', 'M-Pesa', 'Bank')),
  paid_to TEXT NOT NULL CHECK (length(trim(paid_to)) >= 2),
  category TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
  authorized_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  authorized_by_name TEXT NOT NULL,
  authorization_role TEXT NOT NULL CHECK (authorization_role IN ('manager', 'supervisor')),
  recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refunds_hotel_created_idx ON public.refunds(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS expenses_hotel_created_idx ON public.expenses(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refunds_shift_idx ON public.refunds(shift_id);
CREATE INDEX IF NOT EXISTS expenses_shift_idx ON public.expenses(shift_id);

CREATE OR REPLACE FUNCTION public.validate_money_out_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE order_total NUMERIC;
DECLARE approver_role TEXT;
DECLARE approver_name TEXT;
BEGIN
  IF NEW.recorded_by = NEW.authorized_by THEN
    RAISE EXCEPTION 'The person recording money out cannot approve it';
  END IF;
  SELECT CASE WHEN hm.role = 'owner' THEN 'manager' ELSE hm.role END, p.full_name
    INTO approver_role, approver_name
    FROM public.hotel_memberships hm
    JOIN public.profiles p ON p.id = hm.user_id
    WHERE hm.hotel_id = NEW.hotel_id AND hm.user_id = NEW.authorized_by
      AND hm.status = 'active' AND hm.role IN ('owner', 'manager', 'supervisor');
  IF approver_role IS NULL THEN
    RAISE EXCEPTION 'Approver must be an active manager or supervisor';
  END IF;
  NEW.authorization_role := approver_role;
  NEW.authorized_by_name := approver_name;
  IF TG_TABLE_NAME = 'refunds' THEN
    SELECT total INTO order_total FROM public.orders WHERE id = NEW.order_id AND hotel_id = NEW.hotel_id;
    IF order_total IS NULL OR NEW.amount > order_total THEN
      RAISE EXCEPTION 'Refund cannot be more than the order total';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Apply the same protections to deployments that already have the refunds table.
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS refunds_validate_money_out ON public.refunds;
CREATE TRIGGER refunds_validate_money_out BEFORE INSERT ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.validate_money_out_record();
DROP TRIGGER IF EXISTS expenses_validate_money_out ON public.expenses;
CREATE TRIGGER expenses_validate_money_out BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.validate_money_out_record();

CREATE OR REPLACE FUNCTION public.prevent_money_out_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Money-out records are permanent and cannot be changed or deleted';
END; $$;

DROP TRIGGER IF EXISTS refunds_immutable ON public.refunds;
CREATE TRIGGER refunds_immutable BEFORE UPDATE OR DELETE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.prevent_money_out_mutation();
DROP TRIGGER IF EXISTS expenses_immutable ON public.expenses;
CREATE TRIGGER expenses_immutable BEFORE UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.prevent_money_out_mutation();

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_refunds_select ON public.refunds FOR SELECT TO authenticated USING (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_expenses_select ON public.expenses FOR SELECT TO authenticated USING (hotel_id = public.current_hotel_id());
CREATE POLICY tenant_refunds_insert ON public.refunds FOR INSERT TO authenticated WITH CHECK (hotel_id = public.current_hotel_id() AND recorded_by = auth.uid());
CREATE POLICY tenant_expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (hotel_id = public.current_hotel_id() AND recorded_by = auth.uid());
GRANT SELECT, INSERT ON public.refunds, public.expenses TO authenticated;

-- Retire the older free-text deduction path without deleting its audit history.
REVOKE INSERT, UPDATE, DELETE ON public.cash_deductions FROM authenticated;
DROP POLICY IF EXISTS tenant_cash_deductions_insert ON public.cash_deductions;
DROP POLICY IF EXISTS tenant_cash_deductions_manager_delete ON public.cash_deductions;
DROP TRIGGER IF EXISTS cash_deductions_immutable ON public.cash_deductions;
CREATE TRIGGER cash_deductions_immutable BEFORE UPDATE OR DELETE ON public.cash_deductions
FOR EACH ROW EXECUTE FUNCTION public.prevent_money_out_mutation();

DROP TRIGGER IF EXISTS refunds_set_hotel_id ON public.refunds;
CREATE TRIGGER refunds_set_hotel_id BEFORE INSERT ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.set_business_hotel_id();
DROP TRIGGER IF EXISTS expenses_set_hotel_id ON public.expenses;
CREATE TRIGGER expenses_set_hotel_id BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_business_hotel_id();

CREATE OR REPLACE FUNCTION public.get_money_out_approvers()
RETURNS TABLE(id UUID, display_name TEXT, role TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hm.user_id, p.full_name, CASE WHEN hm.role = 'owner' THEN 'manager' ELSE hm.role END
  FROM public.hotel_memberships hm
  JOIN public.profiles p ON p.id = hm.user_id
  WHERE hm.hotel_id = public.current_hotel_id()
    AND hm.status = 'active' AND hm.role IN ('owner', 'manager', 'supervisor')
  ORDER BY p.full_name;
$$;
REVOKE ALL ON FUNCTION public.get_money_out_approvers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_money_out_approvers() TO authenticated;