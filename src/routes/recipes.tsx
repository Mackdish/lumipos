import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/pos";

export const Route = createFileRoute("/recipes")({
  head: () => ({ meta: [{ title: "Recipes & food costing | TillBook" }, { name: "description", content: "Build recipes and calculate dish costs, profit and margins." }] }),
  component: RecipesPage,
});

type Menu = { id: string; name: string; category: string; price: number };
type Stock = { id: string; name: string; unit: string; cost_per_unit: number; current_stock: number };
type Recipe = { id: string; menu_item_id: string; yield_quantity: number; notes: string | null };
type Ingredient = { id: string; recipe_id: string; inventory_item_id: string; quantity: number };
const db = supabase as any;

function RecipesPage() {
  const { isManager, loading } = useAuth();
  const qc = useQueryClient();
  const [selectedMenu, setSelectedMenu] = useState("");
  const [ingredients, setIngredients] = useState<{ inventory_item_id: string; quantity: string }[]>([]);
  const [yieldQty, setYieldQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const { data: menu = [] } = useQuery<Menu[]>({ queryKey: ["recipe-menu"], queryFn: async () => { const { data, error } = await db.from("menu_items").select("id,name,category,price").order("name"); if (error) throw error; return data ?? []; } });
  const { data: stock = [] } = useQuery<Stock[]>({ queryKey: ["recipe-stock"], queryFn: async () => { const { data, error } = await db.from("inventory_items").select("id,name,unit,cost_per_unit,current_stock").eq("is_active", true).order("name"); if (error) throw error; return data ?? []; } });
  const { data: recipes = [] } = useQuery<Recipe[]>({ queryKey: ["recipes"], queryFn: async () => { const { data, error } = await db.from("recipes").select("*"); if (error) throw error; return data ?? []; } });
  const { data: allIngredients = [] } = useQuery<Ingredient[]>({ queryKey: ["recipe-ingredients"], queryFn: async () => { const { data, error } = await db.from("recipe_ingredients").select("*"); if (error) throw error; return data ?? []; } });

  const filteredMenu = useMemo(() => menu.filter(m => m.name.toLowerCase().includes(search.trim().toLowerCase())), [menu, search]);
  const currentRecipe = recipes.find(r => r.menu_item_id === selectedMenu);
  const currentIngredients = allIngredients.filter(i => i.recipe_id === currentRecipe?.id);
  const selectedStock = new Map(stock.map(s => [s.id, s]));
  const draftCost = ingredients.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(selectedStock.get(line.inventory_item_id)?.cost_per_unit || 0), 0);
  const selectedDish = menu.find(m => m.id === selectedMenu);
  const unitCost = draftCost / Math.max(Number(yieldQty || 1), 1);
  const margin = selectedDish && selectedDish.price > 0 ? ((selectedDish.price - unitCost) / selectedDish.price) * 100 : 0;

  function loadRecipe(id: string) {
    setSelectedMenu(id);
    const recipe = recipes.find(r => r.menu_item_id === id);
    setYieldQty(String(recipe?.yield_quantity ?? 1));
    setNotes(recipe?.notes ?? "");
    setIngredients((recipe ? allIngredients.filter(i => i.recipe_id === recipe.id).map(i => ({ inventory_item_id: i.inventory_item_id, quantity: String(i.quantity) })) : []));
  }

  function addIngredient() { setIngredients(v => [...v, { inventory_item_id: stock[0]?.id ?? "", quantity: "" }]); }
  function updateIngredient(index: number, field: "inventory_item_id" | "quantity", value: string) { setIngredients(v => v.map((x, i) => i === index ? { ...x, [field]: value } : x)); }
  function removeIngredient(index: number) { setIngredients(v => v.filter((_, i) => i !== index)); }

  async function saveRecipe() {
    if (!selectedMenu) return toast.error("Select a menu item.");
    const yieldValue = Number(yieldQty);
    if (!Number.isFinite(yieldValue) || yieldValue <= 0) return toast.error("Yield must be above zero.");
    const valid = ingredients.filter(i => i.inventory_item_id && Number(i.quantity) > 0);
    if (!valid.length) return toast.error("Add at least one ingredient.");
    if (new Set(valid.map(i => i.inventory_item_id)).size !== valid.length) return toast.error("Each ingredient can only be added once.");
    setSaving(true);
    try {
      let recipeId = currentRecipe?.id;
      if (recipeId) {
        const { error } = await db.from("recipes").update({ yield_quantity: yieldValue, notes: notes.trim() || null }).eq("id", recipeId);
        if (error) throw error;
        const { error: delError } = await db.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
        if (delError) throw delError;
      } else {
        const { data, error } = await db.from("recipes").insert({ menu_item_id: selectedMenu, yield_quantity: yieldValue, notes: notes.trim() || null }).select("id").single();
        if (error) throw error;
        recipeId = data.id;
      }
      const { error } = await db.from("recipe_ingredients").insert(valid.map(i => ({ recipe_id: recipeId, inventory_item_id: i.inventory_item_id, quantity: Number(i.quantity) })));
      if (error) throw error;
      toast.success("Recipe saved");
      await qc.invalidateQueries({ queryKey: ["recipes"] });
      await qc.invalidateQueries({ queryKey: ["recipe-ingredients"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save recipe"); }
    finally { setSaving(false); }
  }

  if (!loading && !isManager) return <AppShell><main className="mx-auto max-w-3xl px-5 py-16"><div className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access restricted</p><h1 className="mt-2 text-2xl font-bold">Managers only</h1><p className="mt-3 text-sm text-muted-foreground">Recipes and food costs can only be changed by a manager.</p></div></main></AppShell>;

  return <AppShell><main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
    <header><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Production control</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Recipes & food costing</h1><p className="mt-2 text-sm text-muted-foreground">Connect menu dishes to inventory ingredients and see true food cost and margin.</p></header>
    <div className="mt-5 grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dishes..." className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><div className="mt-3 max-h-[65vh] space-y-2 overflow-y-auto">{filteredMenu.map(m => { const has = recipes.some(r => r.menu_item_id === m.id); return <button key={m.id} type="button" onClick={() => loadRecipe(m.id)} className={`w-full rounded-xl border p-3 text-left ${selectedMenu === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}><div className="flex justify-between gap-2"><span className="font-bold">{m.name}</span><span className="text-sm font-semibold">{formatMoney(Number(m.price))}</span></div><p className="mt-1 text-xs text-muted-foreground">{m.category} · {has ? "Recipe configured" : "No recipe yet"}</p></button> })}</div></section>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">{!selectedDish ? <div className="grid min-h-[420px] place-items-center text-center"><div><p className="font-bold">Select a menu item</p><p className="mt-1 text-sm text-muted-foreground">Choose a dish to build its recipe and calculate profitability.</p></div></div> : <><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Recipe</p><h2 className="mt-1 text-xl font-bold">{selectedDish.name}</h2><p className="mt-1 text-sm text-muted-foreground">Selling price: {formatMoney(Number(selectedDish.price))}</p></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Food cost</p><p className="mt-1 font-black">{formatMoney(unitCost)}</p></div><div className="rounded-xl bg-muted p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Gross profit</p><p className="mt-1 font-black">{formatMoney(Number(selectedDish.price) - unitCost)}</p></div><div className="rounded-xl bg-primary/10 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Margin</p><p className="mt-1 font-black">{margin.toFixed(1)}%</p></div></div></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Recipe yield<input type="number" min="0.001" step="0.001" value={yieldQty} onChange={e => setYieldQty(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3" /></label><label className="text-sm font-semibold">Notes<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional preparation notes" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3" /></label></div>
      <div className="mt-6"><div className="flex items-center justify-between"><h3 className="font-bold">Ingredients</h3><button type="button" onClick={addIngredient} disabled={!stock.length} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">+ Add ingredient</button></div><div className="mt-3 space-y-2">{ingredients.map((line, index) => { const s = selectedStock.get(line.inventory_item_id); return <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]"><select value={line.inventory_item_id} onChange={e => updateIngredient(index, "inventory_item_id", e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm">{stock.map(x => <option key={x.id} value={x.id}>{x.name} · {formatMoney(Number(x.cost_per_unit))}/{x.unit}</option>)}</select><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={e => updateIngredient(index, "quantity", e.target.value)} placeholder={`Qty ${s?.unit ?? ""}`} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" onClick={() => removeIngredient(index)} className="h-11 rounded-xl px-3 text-sm font-bold text-destructive hover:bg-destructive/10">Remove</button></div> })}</div>{ingredients.length === 0 && <p className="mt-3 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No ingredients added yet.</p>}</div>
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Recipe ingredient cost: <b className="text-foreground">{formatMoney(draftCost)}</b></p><button type="button" disabled={saving} onClick={saveRecipe} className="h-12 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : currentRecipe ? "Update recipe" : "Save recipe"}</button></div></>}</section>
    </div>
  </main></AppShell>;
}
