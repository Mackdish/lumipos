import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, formatTime, orderCode, type Order } from "@/lib/pos";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order details | Bingo Hotel Order Book" },
      {
        name: "description",
        content: "Review a single order, its dishes and approve the payment.",
      },
      { property: "og:title", content: "Order details | Bingo Hotel Order Book" },
      {
        property: "og:description",
        content: "Review a single order, its dishes and approve the payment.",
      },
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
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, name, quantity, price)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Order) ?? null;
    },
  });

  async function update(patch: Record<string, unknown>) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["order", id] });
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
    toast.success("Order updated");
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-10">
        <Link to="/orders" className="text-sm font-bold text-primary underline">
          ← Back to orders
        </Link>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading order...</p>
        ) : !order ? (
          <p className="mt-6 text-sm text-muted-foreground">This order no longer exists.</p>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">
              {orderCode(order)} · {order.customer}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {order.employee_name} · {formatTime(order.created_at)} · {order.payment_method} ·{" "}
              {order.payment_status}
            </p>

            <section className="mt-6 rounded-2xl border border-border bg-card">
              <h2 className="border-b border-border p-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Items
              </h2>
              <ul className="divide-y divide-border">
                {(order.order_items ?? []).map((item) => (
                  <li key={item.id ?? item.name} className="flex justify-between gap-3 p-4">
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <span className="font-semibold">
                      {formatMoney(Number(item.price) * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between border-t border-border p-4 text-base font-bold">
                <span>Total</span>
                <span>{formatMoney(Number(order.total))}</span>
              </p>
            </section>

            {order.notes && (
              <p className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm">
                <b className="block text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </b>
                {order.notes}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {order.payment_status !== "PAID" && (
                <button
                  onClick={() =>
                    update({
                      payment_status: "PAID",
                      approved_by: user?.id ?? null,
                      approved_at: new Date().toISOString(),
                    })
                  }
                  className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
                >
                  Approve payment
                </button>
              )}
              {order.order_status !== "COMPLETED" && (
                <button
                  onClick={() => update({ order_status: "COMPLETED" })}
                  className="rounded-xl border border-border px-4 py-3 text-sm font-bold"
                >
                  Mark completed
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
