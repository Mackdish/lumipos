import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { exportOrdersToExcel } from "@/lib/export-orders";
import { isWithinOrderWindow, orderVisibilityCutoff, useNow } from "@/lib/order-window";
import {
  formatMoney,
  formatTime,
  orderCode,
  type Order,
} from "@/lib/pos";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Orders | TillBook" },
      { name: "description", content: "Manage restaurant orders and payments." },
    ],
  }),
  component: OrdersPage,
});
const filters = ["All", "PAID"] as const;
function OrdersPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [search, setSearch] = useState("");
  const [includeOlder, setIncludeOlder] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportState, setExportState] = useState<"idle" | "working" | "empty" | "error">("idle");
  const now = useNow();
  const {
    data: orders = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["orders", { includeOlder }],
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, order_items(id, name, quantity, price)")
        .order("created_at", { ascending: false });
      if (!includeOlder) query = query.gte("created_at", orderVisibilityCutoff());
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Order[];
    },
  });
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const inWindow = includeOlder || isWithinOrderWindow(o.created_at, now);
      const matchesFilter =
        filter === "All" || o.payment_status === filter;
      return (
        inWindow &&
        matchesFilter &&
        (!q ||
          o.customer.toLowerCase().includes(q) ||
          o.employee_name.toLowerCase().includes(q) ||
          orderCode(o).toLowerCase().includes(q))
      );
    });
  }, [orders, filter, search, includeOlder, now]);
  const paidTotal = visible
    .filter((o) => o.payment_status === "PAID")
    .reduce((sum, o) => sum + Number(o.total), 0);
  async function handleExport() {
    setExportState("working");
    try {
      const count = await exportOrdersToExcel({
        from: exportFrom || undefined,
        to: exportTo || undefined,
      });
      setExportState(count === 0 ? "empty" : "idle");
    } catch (error) {
      console.error("Order export failed", error);
      setExportState("error");
    }
  }
  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">
              Order management
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Orders</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Find, monitor and manage restaurant orders.
            </p>
          </div>
          <Link
            to="/new-order"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            + New order
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Showing
            </p>
            <p className="mt-1 text-xl font-black">{visible.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Paid value
            </p>
            <p className="mt-1 text-xl font-black">{formatMoney(paidTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Paid orders
            </p>
            <p className="mt-1 text-xl font-black">
              {visible.filter((o) => o.payment_status === "PAID").length}
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client ID, staff or order number"
            aria-label="Search orders"
            className="h-12 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-bold ${filter === f ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2.5 text-xs font-bold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={includeOlder}
                  onChange={(event) => setIncludeOlder(event.target.checked)}
                  className="size-4 rounded border-border accent-primary"
                />
                Include older orders
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  From
                  <input
                    type="date"
                    value={exportFrom}
                    onChange={(event) => setExportFrom(event.target.value)}
                    className="h-11 rounded-xl border border-border bg-card px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  To
                  <input
                    type="date"
                    value={exportTo}
                    onChange={(event) => setExportTo(event.target.value)}
                    className="h-11 rounded-xl border border-border bg-card px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exportState === "working"}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {exportState === "working" ? "Preparing..." : "Export to Excel"}
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {includeOlder
                ? "Showing the full order history."
                : "Showing orders from the last 24 hours. Older orders are kept in the database and are always included in the export."}
            </p>
            {exportState === "empty" && (
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                No orders found for that date range.
              </p>
            )}
            {exportState === "error" && (
              <p className="mt-2 text-xs font-semibold text-destructive">
                Export failed. Please try again.
              </p>
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="mt-5 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
            Unable to load orders. Please refresh and try again.
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="font-semibold">No matching orders</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another search or filter.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3 sm:space-y-4">
            {visible.map((order) => (
              <Link
                key={order.id}
                to="/orders/$id"
                params={{ id: order.id }}
                className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:bg-muted sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold sm:text-base">
                      {orderCode(order)} · {order.customer}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
                      {order.employee_name} · {formatTime(order.created_at)} ·{" "}
                      {order.payment_method}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-black sm:text-base">
                    {formatMoney(Number(order.total))}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${order.payment_status === "PAID" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    {order.payment_status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
