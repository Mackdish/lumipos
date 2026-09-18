import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/pos";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory | TillBook" },
      { name: "description", content: "Manage stock levels, costs, suppliers and stock movements." },
    ],
  }),
  component: InventoryPage,
});

type InventoryItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  current_stock: number;
  reorder_level: number;
  cost_per_unit: number;
  supplier: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Movement = {
  id: string;
  inventory_item_id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  reason: string | null;
  reference: string | null;
  created_at: string;
};

const db = supabase as any;
const UNITS = ["pcs", "kg", "g", "litres", "ml", "boxes", "bottles", "packs"];
const MOVEMENTS = ["PURCHASE", "ADJUSTMENT", "WASTE", "RETURN"];

function InventoryPage() {
  const { isManager, loading } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [movement, setMovement] = useState("PURCHASE");
  const [movementQty, setMovementQty] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [form, setForm] = useState({ name: "", sku: "", unit: "pcs", stock: "", reorder: "", cost: "", supplier: "" });

  const { data: items = [], isLoading, isError } = useQuery<InventoryItem[]>({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const { data, error } = await db.from("inventory_items").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as InventoryItem[];
    },
  });

  const { data: movements = [] } = useQuery<Movement[]>({
    queryKey: ["stock-movements", selected?.id],
    enabled: Boolean(selected),
    queryFn: async () => {
      const { data, error } = await db.from("stock_movements").select("*").eq("inventory_item_id", selected!.id).order("created_at", { ascending: false }).limit(12);
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => !q || item.name.toLowerCase().includes(q) || (item.sku ?? "").toLowerCase().includes(q) || (item.supplier ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const lowStock = items.filter((item) => Number(item.current_stock) <= Number(item.reorder_level));
  const stockValue = items.reduce((sum, item) => sum + Number(item.current_stock) * Number(item.cost_per_unit), 0);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
  };

  const addItem = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Enter an inventory item name.");
      const stock = Number(form.stock || 0);
      const reorder = Number(form.reorder || 0);
      const cost = Number(form.cost || 0);
      if ([stock, reorder, cost].some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Stock, reorder level and cost must be zero or greater.");
      const { data, error } = await db.from("inventory_items").insert({ name: form.name.trim(), sku: form.sku.trim() || null, unit: form.unit, current_stock: stock, reorder_level: reorder, cost_per_unit: cost, supplier: form.supplier.trim() || null }).select("id, current_stock").single();
      if (error) throw error;
      if (stock > 0) await db.from("stock_movements").insert({ inventory_item_id: data.id, movement_type: "PURCHASE", quantity: stock, balance_after: stock, reason: "Opening stock" });
    },
    onSuccess: () => { toast.success("Inventory item added"); setForm({ name: "", sku: "", unit: "pcs", stock: "", reorder: "", cost: "", supplier: "" }); setShowAdd(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const adjustStock = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select an item first.");
      const qty = Number(movementQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter a quantity above zero.");
      const current = Number(selected.current_stock);
      const delta = movement === "PURCHASE" || movement === "RETURN" ? qty : -qty;
      const next = current + delta;
      if (next < 0) throw new Error("Stock cannot go below zero.");
      const { error } = await db.from("inventory_items").update({ current_stock: next }).eq("id", selected.id);
      if (error) throw error;
      const { error: movementError } = await db.from("stock_movements").insert({ inventory_item_id: selected.id, movement_type: movement, quantity: delta, balance_after: next, reason: movementReason.trim() || null });
      if (movementError) throw movementError;
    },
    onSuccess: () => { toast.success("Stock updated"); setMovementQty(""); setMovementReason(""); refresh(); setSelected(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!loading && !isManager) {
    return <AppShell><main className="mx-auto max-w-3xl px-5 py-16"><div className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access restricted</p><h1 className="mt-2 text-2xl font-bold">Managers only</h1><p className="mt-3 text-sm text-muted-foreground">Inventory quantities, costs and stock movements can only be changed by a manager.</p></div></main></AppShell>;
  }

  return <AppShell><main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Stock control</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Inventory</h1><p className="mt-1 text-sm text-muted-foreground">Track stock, reorder levels, suppliers and inventory value.</p></div><button type="button" onClick={() => setShowAdd((v) => !v)} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">{showAdd ? "Close" : "+ Add stock item"}</button></header>

    <section className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Items</p><p className="mt-1 text-2xl font-black">{items.length}</p></div><div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Low stock</p><p className="mt-1 text-2xl font-black">{lowStock.length}</p></div><div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Stock value</p><p className="mt-1 text-2xl font-black">{formatMoney(stockValue)}</p></div></section>

    {showAdd && <form onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }} className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"><h2 className="font-bold">Add inventory item</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input required placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><input placeholder="SKU / code" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="h-11 rounded-xl border border-border bg-background px-3 text-sm">{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select><input placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><input inputMode="decimal" type="number" min="0" step="0.001" placeholder="Opening stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><input inputMode="decimal" type="number" min="0" step="0.001" placeholder="Reorder level" value={form.reorder} onChange={(e) => setForm({ ...form, reorder: e.target.value })} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><input inputMode="decimal" type="number" min="0" step="0.01" placeholder="Cost per unit (KSh)" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><button disabled={addItem.isPending} className="h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{addItem.isPending ? "Saving…" : "Save item"}</button></div></form>}

    <div className="mt-5"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory, SKU or supplier" className="h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div>

    {isLoading ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map((n) => <div key={n} className="h-48 animate-pulse rounded-2xl bg-muted" />)}</div> : isError ? <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">Unable to load inventory. Apply the inventory migration, then refresh.</div> : filtered.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-border bg-card p-10 text-center"><p className="font-bold">No inventory items</p><p className="mt-1 text-sm text-muted-foreground">Add your first stock item above.</p></div> : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((item) => { const low = Number(item.current_stock) <= Number(item.reorder_level); return <article key={item.id} className={`rounded-2xl border bg-card p-4 shadow-sm ${low ? "border-destructive/40" : "border-border"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold">{item.name}</h2><p className="mt-1 text-xs text-muted-foreground">{item.sku || "No SKU"} · {item.supplier || "No supplier"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${low ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{low ? "Low stock" : "In stock"}</span></div><div className="mt-5 flex items-end justify-between"><div><p className="text-3xl font-black">{Number(item.current_stock).toLocaleString("en-KE")}</p><p className="text-xs text-muted-foreground">{item.unit} · reorder at {Number(item.reorder_level).toLocaleString("en-KE")}</p></div><div className="text-right"><p className="text-sm font-bold">{formatMoney(Number(item.cost_per_unit))}</p><p className="text-[10px] text-muted-foreground">per {item.unit}</p></div></div><div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs font-semibold text-muted-foreground">Value {formatMoney(Number(item.current_stock) * Number(item.cost_per_unit))}</span><button type="button" onClick={() => setSelected(item)} className="min-h-10 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">Adjust stock</button></div></article>; })}</div>}

    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5"><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Stock adjustment</p><h2 className="mt-1 text-xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">Current: {Number(selected.current_stock).toLocaleString("en-KE")} {selected.unit}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-xl px-3 py-2 text-sm font-bold hover:bg-muted">Close</button></div><div className="mt-5 grid gap-3"><select value={movement} onChange={(e) => setMovement(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm">{MOVEMENTS.map((type) => <option key={type} value={type}>{type === "ADJUSTMENT" ? "Remove / adjust" : type.charAt(0) + type.slice(1).toLowerCase()}</option>)}</select><input inputMode="decimal" type="number" min="0" step="0.001" value={movementQty} onChange={(e) => setMovementQty(e.target.value)} placeholder={`Quantity (${selected.unit})`} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} placeholder="Reason / reference (optional)" className="h-11 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" disabled={adjustStock.isPending} onClick={() => adjustStock.mutate()} className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50">{adjustStock.isPending ? "Updating…" : "Update stock"}</button></div><div className="mt-6"><h3 className="text-sm font-bold">Recent movements</h3>{movements.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No stock movements yet.</p> : <ul className="mt-3 divide-y divide-border rounded-xl border border-border">{movements.map((m) => <li key={m.id} className="flex items-center justify-between gap-3 p-3 text-sm"><span><b>{m.movement_type}</b><span className="ml-2 text-xs text-muted-foreground">{m.reason || "No reason"}</span></span><span className="font-bold">{m.quantity > 0 ? "+" : ""}{Number(m.quantity).toLocaleString("en-KE")} · {Number(m.balance_after).toLocaleString("en-KE")}</span></li>)}</ul>}</div></div></div>}
  </main></AppShell>;
}
