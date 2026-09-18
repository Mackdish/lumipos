import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/pos";

type Report = {
  business_date: string;
  generated_at: string;
  order_count: number;
  total_sales: number;
  cash_sales: number;
  mpesa_sales: number;
  other_sales: number;
  by_staff: { name: string; count: number; total: number }[];
  by_dish: { name: string; quantity: number; total: number }[];
};

function todayInKenya() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
}

export const Route = createFileRoute("/daily-summary")({
  head: () => ({
    meta: [
      { title: "End-of-day report | TillBook" },
      { name: "description", content: "Generate, print and clear the daily TillBook session." },
    ],
  }),
  component: DailySummary,
});

function DailySummary() {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"report" | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const businessDate = todayInKenya();

  const { data: previousReport } = useQuery({
    queryKey: ["daily-report", businessDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("report_data, cleared_at, generated_at")
        .eq("business_date", businessDate)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const activeReport = report ?? (previousReport?.report_data as Report | null);
  const cleared = Boolean(previousReport?.cleared_at);

  const dateLabel = useMemo(
    () => new Date(businessDate + "T12:00:00").toLocaleDateString("en-KE", { dateStyle: "full" }),
    [businessDate],
  );

  async function generateReport() {
    setBusy("report");
    setMessage(null);
    const { data, error } = await (supabase as any).rpc("generate_daily_report", {
      p_business_date: businessDate,
    });
    setBusy(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setReport(data as Report);
    await queryClient.invalidateQueries({ queryKey: ["daily-report", businessDate] });
    setMessage("Report generated. Review it before clearing the session.");
  }

  async function clearSession() {
    if (!activeReport) {
      setMessage("Generate the end-of-day report first.");
      return;
    }
    if (!window.confirm(
      "Clear today's orders from the active session? The generated report will be retained, but today's orders will be removed from the POS.",
    )) return;

    setBusy("clear");
    setMessage(null);
    const { data, error } = await (supabase as any).rpc("clear_daily_session", {
      p_business_date: businessDate,
    });
    setBusy(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
    await queryClient.invalidateQueries({ queryKey: ["daily-report", businessDate] });
    setMessage("Session cleared. " + (data?.deleted_orders ?? 0) + " order(s) removed from today's POS session.");
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">End of day</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Daily report & session</h1>
            <p className="mt-2 text-sm text-muted-foreground">{dateLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={generateReport}
              disabled={busy !== null || cleared}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "report" ? "Generating..." : "Generate report"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!activeReport}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-bold disabled:opacity-50"
            >
              Print / PDF
            </button>
          </div>
        </div>

        {message && <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-sm">{message}</div>}

        {activeReport ? (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Orders", activeReport.order_count],
                ["Total sales", formatMoney(Number(activeReport.total_sales))],
                ["Cash", formatMoney(Number(activeReport.cash_sales))],
                ["M-Pesa", formatMoney(Number(activeReport.mpesa_sales))],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-border bg-card p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-3 text-2xl font-black">{value}</p>
                </div>
              ))}
            </section>

            {Number(activeReport.other_sales) > 0 && (
              <div className="mt-3 rounded-2xl border border-border bg-card p-4 text-sm font-semibold">
                Other payments: {formatMoney(Number(activeReport.other_sales))}
              </div>
            )}

            <section className="mt-5 rounded-2xl border border-border bg-card">
              <h2 className="border-b border-border p-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Sales by cashier / staff</h2>
              <ul className="divide-y divide-border">
                {activeReport.by_staff.length === 0 ? (
                  <li className="p-4 text-sm text-muted-foreground">No sales recorded.</li>
                ) : activeReport.by_staff.map((item) => (
                  <li key={item.name} className="flex justify-between gap-3 p-4">
                    <span>{item.name} · {item.count} orders</span>
                    <span className="font-bold">{formatMoney(Number(item.total))}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-5 rounded-2xl border border-border bg-card">
              <h2 className="border-b border-border p-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Sales by dish</h2>
              <ul className="divide-y divide-border">
                {activeReport.by_dish.length === 0 ? (
                  <li className="p-4 text-sm text-muted-foreground">No dishes sold.</li>
                ) : activeReport.by_dish.map((item) => (
                  <li key={item.name} className="flex justify-between gap-3 p-4">
                    <span>{item.quantity} × {item.name}</span>
                    <span className="font-bold">{formatMoney(Number(item.total))}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 print:hidden">
              <p className="text-xs font-black uppercase tracking-wider text-amber-700">Session control</p>
              <h2 className="mt-1 text-lg font-bold">{cleared ? "Today's session has been cleared" : "Clear today's orders after reviewing the report"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">The report is retained for the day. Clearing removes today's orders from the active POS session.</p>
              <button
                type="button"
                onClick={clearSession}
                disabled={busy !== null || cleared}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "clear" ? "Clearing..." : cleared ? "Session cleared" : "Clear session"}
              </button>
            </section>
          </>
        ) : (
          <section className="mt-6 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-lg font-bold">Generate today's report first</p>
            <p className="mt-2 text-sm text-muted-foreground">The report captures orders, payment totals, staff sales and dishes sold before you clear the session.</p>
          </section>
        )}
      </main>
    </AppShell>
  );
}
