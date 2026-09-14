import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { KITCHEN_LABELS, KITCHEN_STATUSES, formatMoney, formatTime, orderCode, type KitchenStatus, type Order } from "@/lib/pos";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order details | Bingo Hotel Order Book" },
      { name: "description", content: "Review a single order, its dishes and approve the payment." },
      { property: "og:title", content: "Order details | Bingo Hotel Order Book" },
      { property: "og:description", content: "Review a single order, its dishes and approve the payment." },
    ],
  }),
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, order_items(id, name, quantity, price)").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as unknown as Order) ?? null;
    },
  });

  async function update(patch: { payment_status?: string; order_status?: string; kitchen_status?: string; approved_by?: string | null; approved_at?: string | null }) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["order", id] });
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
    toast.success("Order updated");
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <Link to="/orders" className="text-sm font-bold text-primary underline">← Back to orders</Link>
        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading order...</p>
        ) : !order ? (
          <p className="mt-6 text-sm text-muted-foreground">This order no longer exists.</p>
        ) : (
          <>
            <h1 className="mt-4 break-words text-2xl font-bold tracking-tight sm:text-3xl">{orderCode(order)} · {order.customer}</h1>
            <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm">{order.employee_name} · {formatTime(order.created_at)} · {order.payment_method} · {order.payment_status}</p>

            <section className="mt-5 rounded-2xl border border-border bg-card p-4 sm:mt-6 sm:p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground sm:text-sm">Kitchen status</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {KITCHEN_STATUSES.map((status: KitchenStatus) => {
                  const active = order.kitchen_status === status;
                  return <button key={status} onClick={() => update({ kitchen_status: status, order_status: status === "SERVED" ? "COMPLETED" : "OPEN" })} aria-pressed={active} className={`min-h-11 rounded-xl px-3 py-2.5 text-xs font-bold sm:px-4 sm:text-sm ${active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"}`}>{KITCHEN_LABELS[status]}</button>;
                })}
              </div>
            </section>

            <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card sm:mt-6">
              <h2 className="border-b border-border p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:text-sm">Items</h2>
              <ul className="divide-y divide-border">
                {(order.order_items ?? []).map((item) => <li key={item.id ?? item.name} className="flex justify-between gap-3 p-4 text-sm"><span>{item.quantity} × {item.name}</span><span className="shrink-0 font-semibold">{formatMoney(Number(item.price) * item.quantity)}</span></li>)}
              </ul>
              <p className="flex justify-between border-t border-border p-4 text-base font-bold"><span>Total</span><span>{formatMoney(Number(order.total))}</span></p>
            </section>

            {order.notes && <p className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm"><b className="block text-xs uppercase tracking-wider text-muted-foreground">Notes</b>{order.notes}</p>}
            {order.payment_status !== "PAID" && <div className="mt-5"><button onClick={() => update({ payment_status: "PAID", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })} className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground sm:w-auto">Approve payment</button></div>}
          </>
        )}
      </main>
    </AppShell>
  );
}
