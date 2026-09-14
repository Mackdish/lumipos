-- Staff shift management for LumiPOS.
-- One open shift per staff member; managers can review all shifts.

CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closing_cash NUMERIC(12,2) CHECK (closing_cash IS NULL OR closing_cash >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_shifts_valid_times CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_one_open_per_user
  ON public.staff_shifts(user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_shifts_user_started_idx
  ON public.staff_shifts(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS staff_shifts_started_idx
  ON public.staff_shifts(started_at DESC);

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view own shifts" ON public.staff_shifts;
CREATE POLICY "Staff can view own shifts"
  ON public.staff_shifts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Staff can start own shifts" ON public.staff_shifts;
CREATE POLICY "Staff can start own shifts"
  ON public.staff_shifts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff can end own shifts" ON public.staff_shifts;
CREATE POLICY "Staff can end own shifts"
  ON public.staff_shifts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Managers can delete shifts" ON public.staff_shifts;
CREATE POLICY "Managers can delete shifts"
  ON public.staff_shifts FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

GRANT SELECT, INSERT, UPDATE ON public.staff_shifts TO authenticated;
GRANT DELETE ON public.staff_shifts TO authenticated;
