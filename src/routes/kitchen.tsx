import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatTime, KITCHEN_LABELS, KITCHEN_STATUSES, orderCode, type KitchenStatus, type Order } from "@/lib/pos";
import { toast } from "sonner";

export const Route = createFileRoute("/kitchen")({
  head: () => ({ meta: [{ title: "Kitchen | LumiPOS" }, { name: "description", content: "Kitchen display and order preparation workflow." }] }),
  component: KitchenPage,
});

const nextStatus: Partial<Record<KitchenStatus, KitchenStatus>> = {
  OPEN: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED",
};

const actionLabel: Partial<Record<KitchenStatus, string>> = {
  OPEN: "Start preparing",
  PREPARING: "Mark ready",
  READY: "Mark served",
};

function KitchenPage() {
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["kitchen-orders"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, name, quantity, price)")
        .in("kitchen_status", ["OPEN", "PREPARING", "READY"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Order[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: KitchenStatus }) => {
      const { error } = await supabase.from("orders").update({ kitchen_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Kitchen status updated");
    },
    onError: (error) => toast.error(error.message || "Could not update kitchen status"),
  });

  const counts = KITCHEN_STATUSES.reduce<Record<string, number>>((acc, status) => {
    acc[status] = orders.filter((order) => order.kitchen_status === status).length;
    return acc;
  }, {});

  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Kitchen display</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Kitchen</h1>
            <p className="mt-1 text-sm text-muted-foreground">Live preparation queue. Updates automatically every 5 seconds.</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-bold">
            {(["OPEN", "PREPARING", "READY"] as KitchenStatus[]).map((status) => (
              <span key={status} className="shrink-0 rounded-full bg-muted px-3 py-2">{KITCHEN_LABELS[status]} · {counts[status] ?? 0}</span>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((n) => <div key={n} className="h-72 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : isError ? (
          <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">Unable to load the kitchen queue. Please refresh and try again.</div>
        ) : orders.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            <p className="text-lg font-bold">Kitchen is clear</p>
            <p className="mt-1 text-sm text-muted-foreground">New orders will appear here automatically.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {(["OPEN", "PREPARING", "READY"] as KitchenStatus[]).map((status) => {
              const column = orders.filter((order) => order.kitchen_status === status);
              return (
                <section key={status} className="min-w-0 rounded-2xl border border-border bg-muted/40 p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h2 className="font-bold">{KITCHEN_LABELS[status]}</h2>
                    <span className="rounded-full bg-card px-2.5 py-1 text-xs font-black">{column.length}</span>
                  </div>
                  <div className="space-y-3">
                    {column.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center text-xs text-muted-foreground">No orders</div>
                    ) : column.map((order) => (
                      <article key={order.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-black">{orderCode(order)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{order.customer} · {formatTime(order.created_at)}</p>
                          </div>
                          <span className="text-sm font-black">{formatMoney(Number(order.total))}</span>
                        </div>
                        <ul className="mt-4 space-y-2 border-y border-border py-3">
                          {(order.order_items ?? []).map((item) => (
                            <li key={item.id ?? `${item.name}-${item.quantity}`} className="flex items-start gap-3 text-sm">
                              <span className="grid h-6 min-w-6 place-items-center rounded-md bg-muted text-xs font-black">{item.quantity}</span>
                              <span className="font-semibold">{item.name}</span>
                            </li>
                          ))}
                        </ul>
                        {order.notes && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs font-medium">Note: {order.notes}</p>}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{order.payment_status}</span>
                          {nextStatus[status] && (
                            <button
                              type="button"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: order.id, status: nextStatus[status]! })}
                              className="min-h-10 flex-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50 sm:flex-none"
                            >
                              {actionLabel[status]}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}
