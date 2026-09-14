import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, type MenuItem } from "@/lib/pos";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu management | LumiPOS" },
      {
        name: "description",
        content: "Manage dishes, prices, categories and availability in LumiPOS.",
      },
      { property: "og:title", content: "Menu management | LumiPOS" },
      {
        property: "og:description",
        content: "Manage dishes, prices, categories and availability in LumiPOS.",
      },
    ],
  }),
  component: MenuManagement,
});

const CATEGORIES = ["Breakfast", "Main meals", "Sides", "Drinks"];

function MenuManagement() {
  const { isManager, loading } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [price, setPrice] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const { data: items = [], isLoading, isError, error } = useQuery({
    queryKey: ["menu_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, category, price, is_available")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as MenuItem[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["menu_items"] });

  const categories = useMemo(() => {
    const extras = [...new Set(items.map((item) => item.category))].filter(
      (itemCategory) => !CATEGORIES.includes(itemCategory),
    );
    return ["All", ...CATEGORIES, ...extras];
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = activeCategory === "All" || item.category === activeCategory;
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, items, search]);

  const availableCount = items.filter((item) => item.is_available).length;
  const hiddenCount = items.length - availableCount;

  const addItem = useMutation({
    mutationFn: async () => {
      const value = Number(price);
      if (!name.trim()) throw new Error("Give the dish a name.");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a price above zero.");
      const { error } = await supabase
        .from("menu_items")
        .insert({ name: name.trim(), category, price: value });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setPrice("");
      toast.success("Dish added to the menu.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MenuItem> }) => {
      const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dish removed.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!loading && !isManager) {
    return (
      <AppShell>
        <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access restricted</p>
            <h1 className="mt-2 text-2xl font-bold">Managers only</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Ask a manager to change dishes, prices or menu availability.
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Menu control</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Menu management</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Keep the menu accurate for staff by managing dishes, prices and availability.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-64">
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Available</p>
              <p className="mt-1 text-xl font-bold">{availableCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Hidden</p>
              <p className="mt-1 text-xl font-bold">{hiddenCount}</p>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Add a dish</h2>
              <p className="mt-1 text-xs text-muted-foreground">Create a menu item for the POS.</p>
            </div>
          </div>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              addItem.mutate();
            }}
          >
            <input
              aria-label="Dish name"
              placeholder="Dish name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-primary/30"
            />
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              {CATEGORIES.map((itemCategory) => (
                <option key={itemCategory} value={itemCategory}>{itemCategory}</option>
              ))}
            </select>
            <input
              aria-label="Price"
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="Price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={addItem.isPending}
              className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {addItem.isPending ? "Adding…" : "Add dish"}
            </button>
          </form>
        </section>

        <section className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                aria-label="Search menu"
                placeholder="Search dishes or categories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:max-w-2xl">
              {categories.map((itemCategory) => (
                <button
                  key={itemCategory}
                  type="button"
                  onClick={() => setActiveCategory(itemCategory)}
                  className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition ${
                    activeCategory === itemCategory
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card hover:bg-muted"
                  }`}
                >
                  {itemCategory}
                </button>
              ))}
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-card p-6">
            <h2 className="font-bold">Could not load the menu</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Please try again."}
            </p>
            <button
              type="button"
              onClick={() => refresh()}
              className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
            >
              Try again
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <h2 className="font-bold">No dishes found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {items.length === 0 ? "Add your first dish above." : "Try another search or category."}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className={`rounded-2xl border bg-card p-4 shadow-sm transition ${
                  item.is_available ? "border-border" : "border-dashed border-muted-foreground/30 opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                      {item.category}
                    </span>
                    <h3 className="mt-3 truncate font-bold">{item.name}</h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      item.is_available ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.is_available ? "Available" : "Hidden"}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-lg font-bold">{formatMoney(Number(item.price))}</p>
                  <input
                    aria-label={`Price for ${item.name}`}
                    defaultValue={String(Number(item.price))}
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value) || value <= 0) {
                        e.target.value = String(Number(item.price));
                        return;
                      }
                      if (value !== Number(item.price)) {
                        updateItem.mutate({ id: item.id, patch: { price: value } });
                        toast.success(`${item.name} price updated.`);
                      }
                    }}
                    className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={updateItem.isPending}
                    onClick={() =>
                      updateItem.mutate({
                        id: item.id,
                        patch: { is_available: !item.is_available },
                      })
                    }
                    className="min-h-10 rounded-xl border border-border px-3 py-2 text-xs font-bold transition hover:bg-muted disabled:opacity-60"
                  >
                    {item.is_available ? "Hide from POS" : "Show on POS"}
                  </button>
                  <button
                    type="button"
                    disabled={removeItem.isPending}
                    onClick={() => {
                      if (window.confirm(`Remove ${item.name} from the menu?`)) {
                        removeItem.mutate(item.id);
                      }
                    }}
                    className="min-h-10 rounded-xl px-3 py-2 text-xs font-bold text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
