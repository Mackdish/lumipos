import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, formatTime, isToday, orderCode, type Order } from "@/lib/pos";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard | LumiPOS" }, { name: "description", content: "Daily restaurant sales, orders and payment overview." }] }),
  component: Dashboard,
});

function Metric({ icon, label, value, hint }: { icon: string; label: string; value: string; hint?: string }) {
  return <div className="rounded-[22px] border border-border bg-card p-4 shadow-[0_8px_18px_rgba(15,93,76,0.04)]"><div className="mb-3 flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/8 text-lg text-primary">{icon}</span>{hint ? <span className="text-[10px] font-bold text-muted-foreground">→</span> : null}</div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p></div>;
}

function Dashboard() {
  const { displayName, isManager } = useAuth();
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["orders"], staleTime: 30 * 1000, gcTime: 10 * 60 * 1000, refetchOnWindowFocus: false,
    queryFn: async () => { const { data, error } = await supabase.from("orders").select("*, order_items(id, name, quantity, price)").order("created_at", { ascending: false }); if (error) throw error; return data as unknown as Order[]; },
  });
  const today = orders.filter((o) => isToday(o.created_at));
  const paidToday = today.filter((o) => o.payment_status === "PAID");
  const totalSales = paidToday.reduce((sum, o) => sum + Number(o.total), 0);
  const cashCollected = paidToday
    .filter((o) => o.payment_method === "Cash")
    .reduce((sum, o) => sum + Number(o.total), 0);
  const mpesaCollected = paidToday
    .filter((o) => o.payment_method.toLowerCase().replace(/[-\s]/g, "") === "mpesa")
    .reduce((sum, o) => sum + Number(o.total), 0);
  const allSales = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const paidOrders = paidToday.length;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const summaryCards = [
    { label: "New Orders", value: String(today.length), icon: "◫", hint: true },
    { label: "Paid Orders", value: String(paidOrders), icon: "✓", hint: true },
    { label: "Today's Sales", value: formatMoney(totalSales), icon: "₵", hint: true },
    { label: "Cash Collected", value: formatMoney(cashCollected), icon: "₵", hint: true },
    { label: "M-Pesa Collected", value: formatMoney(mpesaCollected), icon: "₿", hint: true },
    { label: "Total Sales", value: formatMoney(allSales), icon: "₵", hint: true },
  ];

  return <AppShell><main className="mx-auto max-w-7xl px-3 pb-28 pt-3 sm:px-6 sm:pt-6 lg:px-10 lg:pb-10">
    <section className="rounded-[28px] border border-border bg-card p-4 shadow-[0_10px_24px_rgba(15,93,76,0.07)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Today</p>
          <h1 className="mt-2 text-[2rem] font-black tracking-[-0.05em] text-foreground sm:text-[2.4rem]">{greeting}, {displayName.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Here’s what’s happening today</p>
        </div>
        <Link to="/new-order" className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20">+ New Order</Link>
      </div>
    </section>

    <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {summaryCards.map((card) => <Metric key={card.label} icon={card.icon} label={card.label} value={card.value} hint={card.hint ? "" : undefined} />)}
    </section>

    <section className="mt-5 rounded-[26px] border border-border bg-card p-3 shadow-[0_10px_24px_rgba(15,93,76,0.04)] sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="text-lg font-black text-foreground">Recent Orders</h2>
        <Link to="/orders" className="text-sm font-bold text-primary">View all</Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : isError ? (
        <p className="rounded-2xl bg-destructive/5 p-4 text-sm text-destructive">Unable to load recent orders.</p>
      ) : orders.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-xl font-black text-foreground">No orders yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Orders entered today will appear here.</p>
          <Link to="/new-order" className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">+ New Order</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.slice(0, 6).map((order) => {
            const items = (order.order_items ?? []).slice(0, 2).map((item) => item.name).join(", ");
            return <Link key={order.id} to="/orders/$id" params={{ id: order.id }} className="flex items-center justify-between gap-3 rounded-[20px] border border-border bg-background p-3.5 transition hover:bg-muted">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-foreground">#{order.order_number || order.id.slice(0, 4).toUpperCase()}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{items || "Order"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-foreground">{formatMoney(Number(order.total))}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">PAID</span>
                  <span className="text-[11px] font-medium text-muted-foreground">{formatTime(order.created_at)}</span>
                </div>
              </div>
            </Link>;
          })}
        </div>
      )}
    </section>

    <Link to="/new-order" className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl font-light text-primary-foreground shadow-[0_16px_30px_rgba(15,93,76,0.28)] transition hover:scale-[1.02] sm:h-16 sm:w-16">+</Link>
  </main></AppShell>;
}
