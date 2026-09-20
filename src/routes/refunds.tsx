import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import RefundForm, { REASONS } from "@/components/ui/refundform";
import MoneyOutHistory, { type MoneyOutRow } from "@/routes/moneyouthistory";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/refunds")({
  head: () => ({ meta: [{ title: "Refunds | TillBook" }, { name: "description", content: "Record and review every refund given to customers." }] }),
  component: RefundsPage,
});

function RefundsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["refunds-history"],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("refunds")
        .select("id, amount, method, refunded_to, reason_category, reason, authorized_by_name, authorization_role, recorded_by_name, created_at, orders(order_number)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows: MoneyOutRow[] = (data ?? []).map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    title: r.refunded_to,
    detail: `Order #${r.orders?.order_number ?? "?"} · ${r.reason}`,
    badge: REASONS.find((x) => x.value === r.reason_category)?.label ?? "Other",
    method: r.method,
    approvedBy: r.authorized_by_name,
    approverRole: r.authorization_role,
    recordedBy: r.recorded_by_name,
    createdAt: r.created_at,
  }));

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-3 pb-28 pt-3 sm:px-6 sm:pt-6 lg:px-10 lg:pb-10">
        <section className="rounded-[28px] border border-border bg-card p-4 shadow-[0_10px_24px_rgba(15,93,76,0.07)] sm:p-6">
          <h1 className="text-[1.75rem] font-black tracking-[-0.03em] text-foreground sm:text-[2rem]">Refunds</h1>
          <p className="mt-2 text-sm text-muted-foreground">Every refund, who received it, why it was given, and who approved it.</p>
        </section>

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.3fr)]">
          <RefundForm showRecent={false} />
          <MoneyOutHistory title="Refund history" rows={rows} isLoading={isLoading} isError={isError} emptyText="No refunds match these filters." />
        </div>
      </main>
    </AppShell>
  );
}