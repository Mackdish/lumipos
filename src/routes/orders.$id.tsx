import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { KITCHEN_LABELS, KITCHEN_STATUSES, formatMoney, formatTime, orderCode, type KitchenStatus, type Order } from "@/lib/pos";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({ meta: [{ title: "Order details | LumiPOS" }, { name: "description", content: "Review and manage a restaurant order." }] }),
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: order, isLoading, isError } = useQuery({ queryKey: ["order", id], queryFn: async () => { const { data, error } = await supabase.from("orders").select("*, order_items(id, name, quantity, price)").eq("id", id).maybeSingle(); if (error) throw error; return (data as unknown as Order) ?? null; } });
  async function update(patch: { payment_status?: string; order_status?: string; kitchen_status?: string; approved_by?: string | null; approved_at?: string | null }) { const { error } = await supabase.from("orders").update(patch).eq("id", id); if (error) { toast.error(error.message); return; } await queryClient.invalidateQueries({ queryKey: ["order", id] }); await queryClient.invalidateQueries({ queryKey: ["orders"] }); toast.success("Order updated"); }

  return <AppShell><main className="mx-auto max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
    <Link to="/orders" className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-bold text-primary hover:bg-muted">← Orders</Link>
    {isLoading ? <div className="mt-5 space-y-3"><div className="h-10 animate-pulse rounded-xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div> : isError ? <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">Unable to load this order.</div> : !order ? <div className="mt-5 rounded-2xl border border-border bg-card p-8 text-center"><p className="font-semibold">Order not found</p><Link to="/orders" className="mt-3 inline-flex text-sm font-bold text-primary">Return to orders</Link></div> : <>
      <header className="mt-3 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Order details</p><h1 className="mt-1 break-words text-2xl font-black tracking-tight sm:text-3xl">{orderCode(order)}</h1><p className="mt-1 text-sm font-semibold">{order.customer}</p><p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm">{order.employee_name} · {formatTime(order.created_at)} · {order.payment_method}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-3 py-1.5 text-[10px] font-bold uppercase">{order.payment_status}</span><span className="rounded-full bg-muted px-3 py-1.5 text-[10px] font-bold uppercase">{KITCHEN_LABELS[order.kitchen_status as KitchenStatus] ?? order.kitchen_status}</span><Link to="/orders/$id/receipt" params={{ id }} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 sm:px-4 sm:text-sm">Print receipt</Link></div></div></header>
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:mt-5 sm:p-5"><h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground sm:text-sm">Kitchen status</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{KITCHEN_STATUSES.map((status: KitchenStatus) => { const active = order.kitchen_status === status; return <button key={status} type="button" onClick={() => update({ kitchen_status: status, order_status: status === "SERVED" ? "COMPLETED" : "OPEN" })} aria-pressed={active} className={`min-h-11 rounded-xl px-3 py-2.5 text-xs font-bold sm:px-4 sm:text-sm ${active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"}`}>{KITCHEN_LABELS[status]}</button>; })}</div></section>
      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:mt-5"><h2 className="border-b border-border p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:text-sm">Items</h2><ul className="divide-y divide-border">{(order.order_items ?? []).map((item) => <li key={item.id ?? item.name} className="flex items-center justify-between gap-3 p-4 text-sm"><span className="min-w-0"><b>{item.quantity}×</b> {item.name}</span><span className="shrink-0 font-semibold">{formatMoney(Number(item.price) * item.quantity)}</span></li>)}</ul><div className="flex items-center justify-between border-t border-border p-4"><span className="font-bold">Total</span><span className="text-xl font-black">{formatMoney(Number(order.total))}</span></div></section>
      {order.notes && <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Order notes</p><p className="mt-2 whitespace-pre-wrap text-sm">{order.notes}</p></section>}
      {order.payment_status !== "PAID" && <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm"><div><p className="font-bold">Payment pending</p><p className="mt-1 text-sm text-muted-foreground">Confirm the payment after verifying it.</p></div><button type="button" onClick={() => update({ payment_status: "PAID", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })} className="mt-4 min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground sm:w-auto">Approve payment</button></section>}
    </>}
  </main></AppShell>;
}
