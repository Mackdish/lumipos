DROP TRIGGER IF EXISTS orders_validate_kitchen_status ON public.orders;
DROP FUNCTION IF EXISTS public.validate_kitchen_status();
ALTER TABLE public.orders DROP COLUMN IF EXISTS kitchen_status;
