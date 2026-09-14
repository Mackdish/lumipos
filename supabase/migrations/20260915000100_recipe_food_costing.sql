-- LumiPOS Phase 3: recipes and food costing
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL UNIQUE REFERENCES public.menu_items(id) ON DELETE CASCADE,
  yield_quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (yield_quantity > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_inventory_idx ON public.recipe_ingredients(inventory_item_id);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipes_manager_select ON public.recipes;
CREATE POLICY recipes_manager_select ON public.recipes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS recipes_manager_insert ON public.recipes;
CREATE POLICY recipes_manager_insert ON public.recipes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS recipes_manager_update ON public.recipes;
CREATE POLICY recipes_manager_update ON public.recipes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS recipes_manager_delete ON public.recipes;
CREATE POLICY recipes_manager_delete ON public.recipes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS recipe_ingredients_manager_select ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_manager_select ON public.recipe_ingredients FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS recipe_ingredients_manager_insert ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_manager_insert ON public.recipe_ingredients FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS recipe_ingredients_manager_update ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_manager_update ON public.recipe_ingredients FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS recipe_ingredients_manager_delete ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_manager_delete ON public.recipe_ingredients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'manager'));

CREATE OR REPLACE FUNCTION public.set_recipe_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS recipes_set_updated_at ON public.recipes;
CREATE TRIGGER recipes_set_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.set_recipe_updated_at();
