-- Cash drawer deductions recorded against an active cashier shift.
CREATE TABLE IF NOT EXISTS public.cash_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
  authorization_role TEXT NOT NULL CHECK (authorization_role IN ('manager', 'supervisor')),
  authorized_by_name TEXT NOT NULL CHECK (length(trim(authorized_by_name)) >= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_deductions_shift_created_idx
  ON public.cash_deductions(shift_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cash_deductions_hotel_created_idx
  ON public.cash_deductions(hotel_id, created_at DESC);

ALTER TABLE public.cash_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_cash_deductions_select
  ON public.cash_deductions FOR SELECT TO authenticated
  USING (hotel_id = public.current_hotel_id());

CREATE POLICY tenant_cash_deductions_insert
  ON public.cash_deductions FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = public.current_hotel_id()
    AND recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_shifts
      WHERE staff_shifts.id = cash_deductions.shift_id
        AND staff_shifts.hotel_id = public.current_hotel_id()
        AND staff_shifts.user_id = auth.uid()
        AND staff_shifts.ended_at IS NULL
    )
  );

CREATE POLICY tenant_cash_deductions_manager_delete
  ON public.cash_deductions FOR DELETE TO authenticated
  USING (hotel_id = public.current_hotel_id() AND public.current_hotel_role() IN ('owner', 'manager'));

GRANT SELECT, INSERT ON public.cash_deductions TO authenticated;
GRANT DELETE ON public.cash_deductions TO authenticated;

DROP TRIGGER IF EXISTS cash_deductions_set_hotel_id ON public.cash_deductions;
CREATE TRIGGER cash_deductions_set_hotel_id
  BEFORE INSERT OR UPDATE ON public.cash_deductions
  FOR EACH ROW EXECUTE FUNCTION public.set_business_hotel_id();
