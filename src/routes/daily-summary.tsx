import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, isToday, type Order } from "@/lib/pos";

export const Route = createFileRoute("/daily-summary")({
  head: () => ({
    meta: [
      { title: "Daily summary | Bingo Hotel Order Book" },
      {
        name: "description",
        content: "End-of-day totals for cash, M-Pesa and each staff member's sales.",
      },
      { property: "og:title", content: "Daily summary | Bingo Hotel Order Book" },
      {
        property: "og:description",
        content: "End-of-day totals for cash, M-Pesa and each staff member's sales.",
      },
    ],
  }),
  component: DailySummary,
});

function DailySummary() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, name, quantity, price)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Order[];
    },
  });

  const today = orders.filter((o) => isToday(o.created_at));
  const total = today.reduce((sum, o) => sum + Number(o.total), 0);
  const cash = today
    .filter((o) => o.payment_method === "Cash")
    .reduce((sum, o) => sum + Number(o.total), 0);
  const mpesa = total - cash;

  const byStaff = new Map<string, { count: number; total: number }>();
  for (const o of today) {
    const entry = byStaff.get(o.employee_name) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(o.total);
    byStaff.set(o.employee_name, entry);
  }

  const byDish = new Map<string, { quantity: number; total: number }>();
  for (const o of today) {
    for (const item of o.order_items ?? []) {
      const entry = byDish.get(item.name) ?? { quantity: 0, total: 0 };
      entry.quantity += item.quantity;
      entry.total += item.quantity * Number(item.price);
      byDish.set(item.name, entry);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10">
        <h1 className="text-3xl font-bold tracking-tight">Daily summary</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-KE", { dateStyle: "full" })}
        </p>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Adding up today's orders...</p>
        ) : (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Orders
                </p>
                <p className="mt-3 text-2xl font-bold">{today.length}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Cash
                </p>
                <p className="mt-3 text-2xl font-bold">{formatMoney(cash)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  M-Pesa
                </p>
                <p className="mt-3 text-2xl font-bold">{formatMoney(mpesa)}</p>
              </div>
            </section>

            <p className="mt-4 rounded-2xl border border-border bg-card p-5 text-lg font-bold">
              Total takings: {formatMoney(total)}
            </p>

            <section className="mt-6 rounded-2xl border border-border bg-card">
              <h2 className="border-b border-border p-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                By staff member
              </h2>
              <ul className="divide-y divide-border">
                {byStaff.size === 0 && (
                  <li className="p-4 text-sm text-muted-foreground">No sales yet today.</li>
                )}
                {[...byStaff.entries()].map(([name, v]) => (
                  <li key={name} className="flex justify-between gap-3 p-4">
                    <span>
                      {name} · {v.count} orders
                    </span>
                    <span className="font-semibold">{formatMoney(v.total)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card">
              <h2 className="border-b border-border p-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                By dish
              </h2>
              <ul className="divide-y divide-border">
                {byDish.size === 0 && (
                  <li className="p-4 text-sm text-muted-foreground">No dishes sold yet today.</li>
                )}
                {[...byDish.entries()]
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([name, v]) => (
                    <li key={name} className="flex justify-between gap-3 p-4">
                      <span>
                        {v.quantity} × {name}
                      </span>
                      <span className="font-semibold">{formatMoney(v.total)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
