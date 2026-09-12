ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_number TEXT,
  ADD COLUMN IF NOT EXISTS kitchen_status TEXT NOT NULL DEFAULT 'OPEN';

UPDATE public.orders SET kitchen_status = 'SERVED' WHERE order_status = 'COMPLETED';

CREATE OR REPLACE FUNCTION public.validate_kitchen_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.kitchen_status NOT IN ('OPEN','PREPARING','READY','SERVED') THEN
    RAISE EXCEPTION 'Invalid kitchen status: %', NEW.kitchen_status;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_validate_kitchen_status ON public.orders;
CREATE TRIGGER orders_validate_kitchen_status
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_status();

CREATE INDEX IF NOT EXISTS orders_table_number_idx ON public.orders (table_number);