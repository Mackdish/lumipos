CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  current_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(14,2) NOT NULL DEFAULT 0,
  supplier TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_stock_nonnegative CHECK (current_stock >= 0),
  CONSTRAINT inventory_items_reorder_nonnegative CHECK (reorder_level >= 0),
  CONSTRAINT inventory_items_cost_nonnegative CHECK (cost_per_unit >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_sku_unique_idx
  ON public.inventory_items (lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_items_name_idx ON public.inventory_items (lower(name));
CREATE INDEX IF NOT EXISTS inventory_items_low_stock_idx ON public.inventory_items (current_stock, reorder_level);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('PURCHASE','SALE','ADJUSTMENT','WASTE','RETURN')),
  quantity NUMERIC(14,3) NOT NULL,
  balance_after NUMERIC(14,3) NOT NULL,
  reason TEXT,
  reference TEXT,
  employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_item_created_idx
  ON public.stock_movements (inventory_item_id, created_at DESC);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated inventory access" ON public.inventory_items;
CREATE POLICY "authenticated inventory access"
  ON public.inventory_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated stock movement access" ON public.stock_movements;
CREATE POLICY "authenticated stock movement access"
  ON public.stock_movements FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_inventory_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.set_inventory_updated_at();
