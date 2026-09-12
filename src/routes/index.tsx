import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, formatTime, isToday, orderCode, type Order } from "@/lib/pos";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Bingo Hotel Order Book" },
      {
        name: "description",
        content:
          "Live view of today's hotel food orders, cash and M-Pesa takings and pending payments.",
      },
      { property: "og:title", content: "Dashboard | Bingo Hotel Order Book" },
      {
        property: "og:description",
        content: "Track today's hotel food orders, takings and pending payments in one place.",
      },
    ],
  }),
  component: Dashboard,
});

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const { displayName } = useAuth();
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
  const mpesa = today
    .filter((o) => o.payment_method === "M-Pesa")
    .reduce((sum, o) => sum + Number(o.total), 0);
  const pending = today.filter((o) => o.payment_status === "PENDING").length;

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">
              Daily overview
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Welcome back, {displayName.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Here is what is happening in the kitchen today.
            </p>
          </div>
          <Link
            to="/new-order"
            className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            + Create order
          </Link>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Today's orders" value={String(today.length)} />
          <Metric label="Total takings" value={formatMoney(total)} />
          <Metric label="Cash" value={formatMoney(cash)} hint={`M-Pesa ${formatMoney(mpesa)}`} />
          <Metric label="Pending payments" value={String(pending)} hint="Need approval" />
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-lg font-bold">Latest orders</h2>
            <Link to="/orders" className="text-sm font-bold text-primary underline">
              View all
            </Link>
          </div>
          {isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading orders...</p>
          ) : orders.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No orders recorded yet. Create the first one.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {orders.slice(0, 6).map((order) => (
                <li key={order.id}>
                  <Link
                    to="/orders/$id"
                    params={{ id: order.id }}
                    className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
                  >
                    <div>
                      <p className="font-bold">
                        {orderCode(order)} · {order.customer}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {order.employee_name} · {formatTime(order.created_at)} ·{" "}
                        {order.payment_method}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatMoney(Number(order.total))}</p>
                      <p className="text-xs font-bold text-muted-foreground">
                        {order.payment_status}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
