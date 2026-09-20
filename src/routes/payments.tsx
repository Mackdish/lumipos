import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatTime, orderCode, type Order } from "@/lib/pos";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Pending Payments | TillBook" },
      { name: "description", content: "Review all pending restaurant payments." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["orders", "pending-payments"],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, name, quantity, price)")
        .eq("payment_status", "PENDING")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Order[];
    },
  });
  const pendingTotal = orders.reduce((sum, order) => sum + Number(order.total), 0);

  return <AppShell><main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Payment management</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Pending payments</h1><p className="mt-1 text-sm text-muted-foreground">Review and approve every outstanding payment.</p></div>
      <div className="rounded-2xl border border-border bg-card px-4 py-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Outstanding</p><p className="mt-1 text-xl font-black">{formatMoney(pendingTotal)}</p></div>
    </div>
    {isLoading ? <div className="mt-5 space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div> : isError ? <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">Unable to load pending payments. Please refresh and try again.</div> : orders.length === 0 ? <div className="mt-5 rounded-2xl border border-border bg-card p-8 text-center"><p className="font-semibold">No pending payments</p><p className="mt-1 text-sm text-muted-foreground">All recorded orders have been paid.</p></div> : <div className="mt-5 space-y-3 sm:space-y-4">{orders.map((order) => <Link key={order.id} to="/orders/$id" params={{ id: order.id }} className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:bg-muted sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold sm:text-base">{orderCode(order)} · {order.customer}</p><p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">{order.employee_name} · {formatTime(order.created_at)} · {order.payment_method}</p></div><p className="shrink-0 text-sm font-black sm:text-base">{formatMoney(Number(order.total))}</p></div><div className="mt-3"><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">PENDING</span></div></Link>)}</div>}
  </main></AppShell>;
}