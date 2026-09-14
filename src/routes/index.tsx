import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, formatTime, isToday, orderCode, type Order } from "@/lib/pos";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard | LumiPOS" },
      { name: "description", content: "Daily restaurant sales, orders and payment overview." },
    ],
  }),
  component: Dashboard,
});

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const { displayName } = useAuth();
  const { data: orders = [], isLoading, isError } = useQuery({
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
  const cash = today.filter((o) => o.payment_method === "Cash").reduce((sum, o) => sum + Number(o.total), 0);
  const mpesa = today.filter((o) => o.payment_method === "M-Pesa").reduce((sum, o) => sum + Number(o.total), 0);
  const pending = today.filter((o) => o.payment_status === "PENDING").length;
  const open = today.filter((o) => o.order_status === "OPEN").length;

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Today's overview</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {displayName.split(" ")[0]}</h1>
              <p className="mt-2 text-sm text-muted-foreground">Monitor sales and get the next order moving quickly.</p>
            </div>
            <Link to="/new-order" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90">+ New order</Link>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Orders" value={String(today.length)} />
          <Metric label="Sales" value={formatMoney(total)} />
          <Metric label="Cash" value={formatMoney(cash)} />
          <Metric label="M-Pesa" value={formatMoney(mpesa)} />
          <Metric label="Open / pending" value={`${open} / ${pending}`} hint="Orders / payments" />
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-border p-5">
            <div><h2 className="text-lg font-bold">Recent orders</h2><p className="mt-1 text-xs text-muted-foreground">Latest activity across the POS.</p></div>
            <Link to="/orders" className="rounded-lg px-3 py-2 text-sm font-bold text-primary hover:bg-muted">View all</Link>
          </div>
          {isLoading ? (
            <div className="space-y-3 p-5"><div className="h-12 animate-pulse rounded-xl bg-muted" /><div className="h-12 animate-pulse rounded-xl bg-muted" /><div className="h-12 animate-pulse rounded-xl bg-muted" /></div>
          ) : isError ? (
            <p className="p-5 text-sm text-destructive">Unable to load recent orders. Check the connection and try again.</p>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center"><p className="font-semibold">No orders yet</p><p className="mt-1 text-sm text-muted-foreground">Create your first order to start tracking sales.</p><Link to="/new-order" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Create order</Link></div>
          ) : (
            <ul className="divide-y divide-border">
              {orders.slice(0, 8).map((order) => (
                <li key={order.id}>
                  <Link to="/orders/$id" params={{ id: order.id }} className="flex min-h-16 items-center justify-between gap-4 p-4 transition hover:bg-muted sm:p-5">
                    <div className="min-w-0"><p className="truncate text-sm font-bold sm:text-base">{orderCode(order)} · {order.customer}</p><p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">{order.employee_name} · {formatTime(order.created_at)} · {order.payment_method}</p></div>
                    <div className="shrink-0 text-right"><p className="text-sm font-bold sm:text-base">{formatMoney(Number(order.total))}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{order.payment_status}</p></div>
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
