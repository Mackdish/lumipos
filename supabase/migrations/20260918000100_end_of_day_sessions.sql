-- TillBook end-of-day reporting and session clearing.
-- Reports are retained before orders are cleared so the day remains auditable.

CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at TIMESTAMPTZ,
  cleared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  total_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  mpesa_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (hotel_id, business_date)
);

CREATE INDEX IF NOT EXISTS daily_reports_hotel_date_idx
  ON public.daily_reports(hotel_id, business_date DESC);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_reports_select ON public.daily_reports;
CREATE POLICY daily_reports_select ON public.daily_reports
  FOR SELECT TO authenticated
  USING (hotel_id = public.current_hotel_id());

DROP POLICY IF EXISTS daily_reports_insert ON public.daily_reports;
CREATE POLICY daily_reports_insert ON public.daily_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = public.current_hotel_id()
    AND public.current_hotel_role() IN ('owner','manager','cashier')
  );

DROP POLICY IF EXISTS daily_reports_update ON public.daily_reports;
CREATE POLICY daily_reports_update ON public.daily_reports
  FOR UPDATE TO authenticated
  USING (
    hotel_id = public.current_hotel_id()
    AND public.current_hotel_role() IN ('owner','manager','cashier')
  )
  WITH CHECK (
    hotel_id = public.current_hotel_id()
    AND public.current_hotel_role() IN ('owner','manager','cashier')
  );

GRANT SELECT, INSERT, UPDATE ON public.daily_reports TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_daily_report(
  p_business_date DATE DEFAULT (timezone('Africa/Nairobi', now()))::date
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_id UUID := public.current_hotel_id();
  v_user_id UUID := auth.uid();
  v_order_count INTEGER;
  v_total NUMERIC(14,2);
  v_cash NUMERIC(14,2);
  v_mpesa NUMERIC(14,2);
  v_other NUMERIC(14,2);
  v_report JSONB;
BEGIN
  IF v_user_id IS NULL OR v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Active hotel session is required';
  END IF;

  SELECT
    count(*)::integer,
    COALESCE(sum(total), 0),
    COALESCE(sum(total) FILTER (WHERE lower(payment_method) = 'cash'), 0),
    COALESCE(sum(total) FILTER (WHERE lower(payment_method) = 'm-pesa'), 0),
    COALESCE(sum(total) FILTER (WHERE lower(payment_method) NOT IN ('cash', 'm-pesa')), 0)
  INTO v_order_count, v_total, v_cash, v_mpesa, v_other
  FROM public.orders
  WHERE hotel_id = v_hotel_id
    AND (created_at AT TIME ZONE 'Africa/Nairobi')::date = p_business_date;

  SELECT jsonb_build_object(
    'business_date', p_business_date,
    'generated_at', now(),
    'order_count', v_order_count,
    'total_sales', v_total,
    'cash_sales', v_cash,
    'mpesa_sales', v_mpesa,
    'other_sales', v_other,
    'by_staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', employee_name,
        'count', order_count,
        'total', total
      ) ORDER BY total DESC)
      FROM (
        SELECT employee_name, count(*)::integer AS order_count, COALESCE(sum(total),0) AS total
        FROM public.orders
        WHERE hotel_id = v_hotel_id
          AND (created_at AT TIME ZONE 'Africa/Nairobi')::date = p_business_date
        GROUP BY employee_name
      ) staff
    ), '[]'::jsonb),
    'by_dish', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', name,
        'quantity', quantity,
        'total', total
      ) ORDER BY total DESC)
      FROM (
        SELECT oi.name, COALESCE(sum(oi.quantity),0)::integer AS quantity,
               COALESCE(sum(oi.quantity * oi.price),0) AS total
        FROM public.order_items oi
        INNER JOIN public.orders o ON o.id = oi.order_id
        WHERE o.hotel_id = v_hotel_id
          AND (o.created_at AT TIME ZONE 'Africa/Nairobi')::date = p_business_date
        GROUP BY oi.name
      ) dishes
    ), '[]'::jsonb)
  ) INTO v_report;

  INSERT INTO public.daily_reports (
    hotel_id, business_date, generated_by, generated_at,
    order_count, total_sales, cash_sales, mpesa_sales, other_sales, report_data
  )
  VALUES (
    v_hotel_id, p_business_date, v_user_id, now(),
    v_order_count, v_total, v_cash, v_mpesa, v_other, v_report
  )
  ON CONFLICT (hotel_id, business_date) DO UPDATE SET
    generated_by = EXCLUDED.generated_by,
    generated_at = EXCLUDED.generated_at,
    order_count = EXCLUDED.order_count,
    total_sales = EXCLUDED.total_sales,
    cash_sales = EXCLUDED.cash_sales,
    mpesa_sales = EXCLUDED.mpesa_sales,
    other_sales = EXCLUDED.other_sales,
    report_data = EXCLUDED.report_data,
    cleared_at = NULL,
    cleared_by = NULL;

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_daily_report(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_daily_report(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_daily_session(
  p_business_date DATE DEFAULT (timezone('Africa/Nairobi', now()))::date
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_id UUID := public.current_hotel_id();
  v_user_id UUID := auth.uid();
  v_report public.daily_reports%ROWTYPE;
  v_order_ids UUID[];
  v_deleted INTEGER := 0;
BEGIN
  IF v_user_id IS NULL OR v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Active hotel session is required';
  END IF;

  SELECT * INTO v_report
  FROM public.daily_reports
  WHERE hotel_id = v_hotel_id AND business_date = p_business_date
  FOR UPDATE;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'Generate the end-of-day report before clearing the session';
  END IF;

  IF v_report.cleared_at IS NOT NULL THEN
    RAISE EXCEPTION 'This session has already been cleared';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_order_ids
  FROM public.orders
  WHERE hotel_id = v_hotel_id
    AND (created_at AT TIME ZONE 'Africa/Nairobi')::date = p_business_date;

  IF cardinality(v_order_ids) > 0 THEN
    DELETE FROM public.order_items WHERE order_id = ANY(v_order_ids);
    DELETE FROM public.orders WHERE id = ANY(v_order_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  UPDATE public.daily_reports
  SET cleared_at = now(), cleared_by = v_user_id
  WHERE id = v_report.id;

  RETURN jsonb_build_object(
    'success', true,
    'business_date', p_business_date,
    'deleted_orders', v_deleted,
    'report_id', v_report.id,
    'cleared_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_daily_session(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_daily_session(DATE) TO authenticated;
