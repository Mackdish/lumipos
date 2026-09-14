import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/pos";

export const Route = createFileRoute("/shifts")({
  head: () => ({
    meta: [
      { title: "Staff shifts | LumiPOS" },
      { name: "description", content: "Start, close and review staff shifts." },
    ],
  }),
  component: Shifts,
});

type Shift = {
  id: string;
  user_id: string;
  staff_name: string;
  started_at: string;
  ended_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  notes: string | null;
};

function Shifts() {
  const { user, displayName, isManager, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const db = supabase as any;

  const active = useQuery({
    queryKey: ["active-shift", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("staff_shifts")
        .select("*")
        .eq("user_id", user!.id)
        .is("ended_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as Shift | null;
    },
  });

  const history = useQuery({
    queryKey: ["shift-history", user?.id, isManager],
    enabled: !!user,
    queryFn: async () => {
      let q = db
        .from("staff_shifts")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(isManager ? 100 : 20);
      if (!isManager) q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });

  const cash = useQuery({
    queryKey: ["shift-cash", active.data?.id],
    enabled: !!active.data,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("total")
        .eq("employee_id", user!.id)
        .eq("payment_method", "Cash")
        .eq("payment_status", "PAID")
        .gte("created_at", active.data!.started_at);
      if (error) throw error;
      return (data ?? []).reduce((sum, order) => sum + Number(order.total || 0), 0);
    },
  });

  const expected = Number(active.data?.opening_cash || 0) + Number(cash.data || 0);
  const variance = closing === "" ? null : Number(closing) - expected;

  const dashboard = useMemo(() => {
    const rows = history.data ?? [];
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const activeCount = rows.filter((shift) => !shift.ended_at).length;
    const todayCount = rows.filter((shift) => new Date(shift.started_at).getTime() >= startOfToday).length;
    const closedCount = rows.filter((shift) => !!shift.ended_at).length;
    const staffCount = new Set(rows.map((shift) => shift.user_id)).size;

    return { activeCount, todayCount, closedCount, staffCount };
  }, [history.data]);

  async function start(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = Number(opening);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid opening cash amount.");
      return;
    }

    setBusy(true);
    const { error } = await db.from("staff_shifts").insert({
      user_id: user!.id,
      staff_name: displayName,
      opening_cash: amount,
      notes: notes.trim() || null,
    });
    setBusy(false);

    if (error) {
      setError(error.code === "23505" ? "You already have an open shift." : error.message);
      return;
    }

    setOpening("");
    setNotes("");
    await qc.invalidateQueries({ queryKey: ["active-shift", user?.id] });
    await qc.invalidateQueries({ queryKey: ["shift-history", user?.id, isManager] });
  }

  async function end(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!active.data) return;

    const amount = Number(closing);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid closing cash amount.");
      return;
    }

    setBusy(true);
    const { error } = await db
      .from("staff_shifts")
      .update({
        ended_at: new Date().toISOString(),
        closing_cash: amount,
        notes: notes.trim() || active.data.notes,
      })
      .eq("id", active.data.id)
      .eq("user_id", user!.id)
      .is("ended_at", null);
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  if (loading || !user) {
    return (
      <AppShell>
        <main className="mx-auto max-w-5xl px-5 py-8 text-sm text-muted-foreground">
          Loading shift information...
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-5 py-7 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Staff operations</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Shift management</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track opening cash, cash sales, closing balances and staff activity.
            </p>
          </div>
          {active.data && (
            <span className="w-fit rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              Shift active
            </span>
          )}
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {isManager && (
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Active shifts" value={String(dashboard.activeCount)} />
            <Metric label="Shifts today" value={String(dashboard.todayCount)} />
            <Metric label="Closed shifts" value={String(dashboard.closedCount)} />
            <Metric label="Staff recorded" value={String(dashboard.staffCount)} />
          </section>
        )}

        {!active.data ? (
          <form onSubmit={start} className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold">Start shift</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Record the cash float before serving customers.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Opening cash (KES)
                <input
                  required
                  inputMode="decimal"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="0.00"
                  className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3"
                />
              </label>
              <label className="text-sm font-semibold">
                Notes (optional)
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Cash float received..."
                  className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3"
                />
              </label>
            </div>
            <button
              disabled={busy}
              className="mt-5 min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Starting..." : "Start shift"}
            </button>
          </form>
        ) : (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-3">
              <Metric label="Opening cash" value={formatMoney(Number(active.data.opening_cash))} />
              <Metric label="Cash sales" value={formatMoney(Number(cash.data || 0))} />
              <Metric label="Expected cash" value={formatMoney(expected)} />
            </section>

            <form onSubmit={end} className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold">End shift</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Count the cash drawer and enter the actual amount.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Closing cash (KES)
                  <input
                    required
                    inputMode="decimal"
                    value={closing}
                    onChange={(e) => setClosing(e.target.value)}
                    placeholder={expected.toFixed(2)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3"
                  />
                </label>
                <div className="rounded-xl bg-muted/50 p-3 text-sm">
                  <p className="text-muted-foreground">Variance</p>
                  <p
                    className={`mt-1 text-lg font-bold ${
                      variance !== null && variance < 0 ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {variance === null
                      ? "—"
                      : `${variance >= 0 ? "+" : ""}${formatMoney(variance)}`}
                  </p>
                </div>
              </div>
              <label className="mt-4 block text-sm font-semibold">
                Notes (optional)
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Explain any cash difference..."
                  className="mt-2 w-full rounded-xl border border-input bg-background p-3"
                />
              </label>
              <button
                disabled={busy}
                className="mt-5 min-h-11 rounded-xl bg-destructive px-5 text-sm font-bold text-destructive-foreground disabled:opacity-50"
              >
                {busy ? "Closing..." : "End shift & sign out"}
              </button>
            </form>
          </>
        )}

        <section className="mt-8 rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">Shift history</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isManager ? "Recent shifts for all staff members." : "Your recent shifts."}
                </p>
              </div>
              {isManager && (
                <span className="text-xs font-medium text-muted-foreground">Audit-friendly staff records</span>
              )}
            </div>
          </div>
          <div className="divide-y divide-border">
            {history.isLoading ? (
              <div className="space-y-3 p-5">
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-64 animate-pulse rounded bg-muted" />
              </div>
            ) : history.error ? (
              <p className="p-5 text-sm text-destructive">Unable to load shift history.</p>
            ) : history.data?.length ? (
              history.data.map((shift) => <ShiftRow key={shift.id} shift={shift} />)
            ) : (
              <p className="p-5 text-sm text-muted-foreground">No shift records yet.</p>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ShiftRow({ shift }: { shift: Shift }) {
  const closed = !!shift.ended_at;

  return (
    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold">{shift.staff_name}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              closed ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
            }`}
          >
            {closed ? "Closed" : "Active"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Started {new Date(shift.started_at).toLocaleString("en-KE")}
          {closed ? ` · Ended ${new Date(shift.ended_at!).toLocaleString("en-KE")}` : ""}
        </p>
        {shift.notes && (
          <p className="mt-2 max-w-2xl text-xs text-muted-foreground">Note: {shift.notes}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm sm:justify-end">
        <span>Opening {formatMoney(Number(shift.opening_cash))}</span>
        {closed && shift.closing_cash !== null && (
          <span>Closing {formatMoney(Number(shift.closing_cash))}</span>
        )}
      </div>
    </div>
  );
}
