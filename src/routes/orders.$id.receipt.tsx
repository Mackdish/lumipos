import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatTime, orderCode, type Order } from "@/lib/pos";

export const Route = createFileRoute("/orders/$id/receipt")({
  head: () => ({
    meta: [
      { title: "Receipt | TillBook" },
      { name: "description", content: "Printable restaurant receipt." },
    ],
  }),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { id } = Route.useParams();
  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", id, "receipt"],
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

  function printReceipt() {
    window.print();
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">Loading receipt…</div>;
  }

  if (isError || !order) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-black">Receipt unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">We could not load this order.</p>
        <Link to="/orders" className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Back to orders</Link>
      </main>
    );
  }

  return (
    <>
      <div className="receipt-actions mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-4 sm:max-w-lg">
        <Link to="/orders/$id" params={{ id }} className="text-sm font-bold text-primary">← Order</Link>
        <button type="button" onClick={printReceipt} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Print receipt</button>
      </div>

      <main className="receipt-page mx-auto w-full max-w-[80mm] bg-white px-3 pb-8 pt-2 text-black sm:px-4">
        <header className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-black text-sm font-black text-white">TB</div>
          <h1 className="mt-2 text-xl font-black tracking-tight">TillBook</h1>
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-black/60">Restaurant receipt</p>
        </header>

        <div className="my-4 border-t border-dashed border-black/30" />

        <section className="space-y-1 text-[12px]">
          <div className="flex justify-between gap-3"><span>Receipt</span><strong>{orderCode(order)}</strong></div>
          <div className="flex justify-between gap-3"><span>Date</span><span>{new Date(order.created_at).toLocaleDateString("en-KE")}</span></div>
          <div className="flex justify-between gap-3"><span>Time</span><span>{formatTime(order.created_at)}</span></div>
          <div className="flex justify-between gap-3"><span>Customer</span><span className="max-w-[48mm] text-right break-words">{order.customer}</span></div>
          <div className="flex justify-between gap-3"><span>Cashier</span><span className="max-w-[48mm] text-right break-words">{order.employee_name}</span></div>
          <div className="flex justify-between gap-3"><span>Payment</span><strong>{order.payment_method}</strong></div>
          <div className="flex justify-between gap-3"><span>Status</span><strong>{order.payment_status}</strong></div>
        </section>

        <div className="my-4 border-t border-dashed border-black/30" />

        <section>
          <div className="mb-2 grid grid-cols-[1fr_auto] gap-3 text-[10px] font-black uppercase tracking-wider">
            <span>Item</span>
            <span>Amount</span>
          </div>
          <ul className="space-y-2 text-[12px]">
            {(order.order_items ?? []).map((item) => (
              <li key={item.id ?? item.name} className="grid grid-cols-[1fr_auto] gap-3">
                <span className="min-w-0 break-words"><b>{item.quantity}×</b> {item.name}</span>
                <span className="whitespace-nowrap font-semibold">{formatMoney(Number(item.price) * item.quantity)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="my-4 border-t border-dashed border-black/30" />

        <div className="flex items-center justify-between text-base font-black">
          <span>TOTAL</span>
          <span>{formatMoney(Number(order.total))}</span>
        </div>

        {order.notes && (
          <div className="mt-4 rounded-lg border border-black/15 p-2 text-[11px]">
            <strong>Notes:</strong> {order.notes}
          </div>
        )}

        <footer className="mt-6 text-center text-[10px] leading-4 text-black/60">
          <p>Thank you for your order.</p>
          <p className="mt-1">Powered by TillBook</p>
        </footer>
      </main>

      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .receipt-actions {
            display: none !important;
          }
          .receipt-page {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 5mm 4mm 8mm !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </>
  );
}
