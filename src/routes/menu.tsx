import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, type MenuItem } from "@/lib/pos";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu management | Bingo Hotel Order Book" },
      {
        name: "description",
        content: "Managers add dishes, update prices and hide items that are off the menu today.",
      },
      { property: "og:title", content: "Menu management | Bingo Hotel Order Book" },
      {
        property: "og:description",
        content: "Managers add dishes, update prices and hide items that are off the menu today.",
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

  const { data: items = [], isLoading } = useQuery({
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
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MenuItem> }) => {
      const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
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
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  if (!loading && !isManager) {
    return (
      <AppShell>
        <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <h1 className="text-2xl font-bold">Managers only</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Ask a manager to change dishes or prices on the menu.
          </p>
        </main>
      </AppShell>
    );
  }

  const grouped = CATEGORIES.concat(
    [...new Set(items.map((i) => i.category))].filter((c) => !CATEGORIES.includes(c)),
  );

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10">
        <h1 className="text-3xl font-bold tracking-tight">Menu management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add dishes, change prices, and hide anything that is not being served.
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Add a dish
          </h2>
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
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              aria-label="Price"
              inputMode="numeric"
              placeholder="Price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={addItem.isPending}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              Add
            </button>
          </form>
        </section>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading the menu...</p>
        ) : (
          grouped.map((cat) => {
            const rows = items.filter((i) => i.category === cat);
            if (rows.length === 0) return null;
            return (
              <section key={cat} className="mt-6 rounded-2xl border border-border bg-card">
                <h2 className="border-b border-border p-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {cat}
                </h2>
                <ul className="divide-y divide-border">
                  {rows.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(Number(item.price))}
                          {item.is_available ? "" : " · hidden from staff"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`Price for ${item.name}`}
                          defaultValue={String(Number(item.price))}
                          inputMode="numeric"
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
                          className="w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() =>
                            updateItem.mutate({
                              id: item.id,
                              patch: { is_available: !item.is_available },
                            })
                          }
                          className="rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"
                        >
                          {item.is_available ? "Hide" : "Show"}
                        </button>
                        <button
                          onClick={() => removeItem.mutate(item.id)}
                          className="rounded-xl px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </main>
    </AppShell>
  );
}
