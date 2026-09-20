import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/pos";

export type MoneyOutRow = {
  id: string;
  amount: number;
  title: string;          // who received the money
  detail: string;         // what it was for
  badge: string;          // category label
  method: string;         // Cash | M-Pesa | Bank
  approvedBy: string;
  approverRole: string;
  recordedBy: string | null;
  createdAt: string;
};

type Period = "today" | "7" | "30" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "all", label: "All" },
];

function periodStart(period: Period): Date | null {
  if (period === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period !== "today") d.setDate(d.getDate() - (Number(period) - 1));
  return d;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const select = "h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export default function MoneyOutHistory({
  title, rows, isLoading, isError, emptyText,
}: { title: string; rows: MoneyOutRow[]; isLoading: boolean; isError: boolean; emptyText: string }) {
  const [period, setPeriod] = useState<Period>("7");
  const [method, setMethod] = useState("all");
  const [approver, setApprover] = useState("all");

  const methods = useMemo(() => Array.from(new Set(rows.map((r) => r.method))).sort(), [rows]);
  const approvers = useMemo(() => Array.from(new Set(rows.map((r) => r.approvedBy))).sort(), [rows]);

  const filtered = useMemo(() => {
    const from = periodStart(period);
    return rows.filter((r) =>
      (!from || new Date(r.createdAt) >= from) &&
      (method === "all" || r.method === method) &&
      (approver === "all" || r.approvedBy === approver),
    );
  }, [rows, period, method, approver]);

  const total = filtered.reduce((sum, r) => sum + r.amount, 0);
  const byMethod = filtered.reduce<Record<string, number>>((acc, r) => {
    acc[r.method] = (acc[r.method] ?? 0) + r.amount;
    return acc;
  }, {});

  return (
    <section className="rounded-[26px] border border-border bg-card p-4 shadow-[0_10px_24px_rgba(15,93,76,0.04)] sm:p-5">
      <h2 className="text-lg font-black text-foreground">{title}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
              className={`h-8 rounded-lg px-3 text-xs font-bold transition ${period === p.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <select aria-label="Filter by method" value={method} onChange={(e) => setMethod(e.target.value)} className={select}>
          <option value="all">All methods</option>
          {methods.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="Filter by approver" value={approver} onChange={(e) => setApprover(e.target.value)} className={select}>
          <option value="all">All approvers</option>
          {approvers.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-2xl bg-muted/60 px-4 py-3">
          <p className="text-[11px] font-bold text-muted-foreground">Total out · {filtered.length}</p>
          <p className="mt-1 text-xl font-black">{formatMoney(total)}</p>
        </div>
        {Object.entries(byMethod).map(([m, value]) => (
          <div key={m} className="rounded-2xl bg-muted/60 px-4 py-3">
            <p className="text-[11px] font-bold text-muted-foreground">{m}</p>
            <p className="mt-1 text-xl font-black">{formatMoney(value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          [1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)
        ) : isError ? (
          <p className="rounded-2xl bg-destructive/5 p-4 text-sm text-destructive">Unable to load records.</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-background p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-foreground">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.detail}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-foreground">-{formatMoney(r.amount)}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{r.method}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-foreground">{r.badge}</span>
                <span>Approved by <b className="text-foreground">{r.approvedBy}</b> ({r.approverRole})</span>
                {r.recordedBy && <span>Recorded by {r.recordedBy}</span>}
                <span>{formatWhen(r.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}