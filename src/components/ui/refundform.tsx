import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, formatTime } from "@/lib/pos";

export const REASONS = [
  { value: "wrong_order", label: "Wrong order served" },
  { value: "quality", label: "Food quality complaint" },
  { value: "overcharged", label: "Customer overcharged" },
  { value: "cancelled", label: "Order cancelled" },
  { value: "other", label: "Other" },
];

type PaidOrder = { id: string; order_number: string | null; total: number; payment_method: string; created_at: string };
type Approver = { id: string; display_name: string; role: "manager" | "supervisor" };
type Refund = { id: string; amount: number; method: string; refunded_to: string; reason: string; authorized_by_name: string; authorization_role: string; created_at: string };

const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export default function RefundForm({ showRecent = true }: { showRecent?: boolean }) {
  const { user, displayName } = useAuth();
  const queryClient = useQueryClient();

  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"Cash" | "M-Pesa">("Cash");
  const [refundedTo, setRefundedTo] = useState("");
  const [category, setCategory] = useState("wrong_order");
  const [reason, setReason] = useState("");
  const [approverId, setApproverId] = useState("");

  const orders = useQuery({
    queryKey: ["refundable-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, total, payment_method, created_at")
        .eq("payment_status", "PAID")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as PaidOrder[];
    },
  });

  const approvers = useQuery({
    queryKey: ["approvers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_money_out_approvers");
      if (error) throw error;
      return (data ?? []) as Approver[];
    },
  });

  const activeShift = useQuery({
    queryKey: ["active-shift", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_shifts").select("id").eq("user_id", user!.id).is("ended_at", null).maybeSingle();
      if (error) throw error;
      return data as { id: string } | null;
    },
  });

  const recent = useQuery({
    queryKey: ["refunds-recent"],
    enabled: showRecent,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("refunds")
        .select("id, amount, method, refunded_to, reason, authorized_by_name, authorization_role, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Refund[];
    },
  });

  const selectedOrder = orders.data?.find((o) => o.id === orderId);
  // Never offer yourself as the approver.
  const approverChoices = (approvers.data ?? []).filter((a) => a.id !== user?.id);

  function pickOrder(id: string) {
    setOrderId(id);
    const order = orders.data?.find((o) => o.id === id);
    if (order) {
      setAmount(String(order.total));
      setMethod(order.payment_method.toLowerCase().replace(/[-\s]/g, "") === "mpesa" ? "M-Pesa" : "Cash");
    }
  }

  const submitRefund = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      const approver = approverChoices.find((a) => a.id === approverId);
      if (!selectedOrder) throw new Error("Choose the order being refunded.");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a refund amount above zero.");
      if (value > Number(selectedOrder.total)) throw new Error("Refund cannot be more than the order total.");
      if (refundedTo.trim().length < 2) throw new Error("Enter who received the refund.");
      if (reason.trim().length < 5) throw new Error("Explain why the refund is being given.");
      if (!approver) throw new Error("Choose the manager or supervisor who approved this.");

      const { error } = await (supabase as any).from("refunds").insert({
        order_id: selectedOrder.id,
        shift_id: activeShift.data?.id ?? null,
        amount: value,
        method,
        refunded_to: refundedTo.trim(),
        reason_category: category,
        reason: reason.trim(),
        authorized_by: approver.id,
        authorized_by_name: approver.display_name,
        authorization_role: approver.role,
        recorded_by: user!.id,
        recorded_by_name: displayName,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setOrderId(""); setAmount(""); setRefundedTo(""); setReason(""); setApproverId(""); setCategory("wrong_order");
      await queryClient.invalidateQueries({ queryKey: ["refunds-recent"] });
      await queryClient.invalidateQueries({ queryKey: ["refunds-history"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-cash-out"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-deductions"] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submitRefund.mutate();
  }

  return (
    <section className="rounded-[26px] border border-border bg-card p-4 shadow-[0_10px_24px_rgba(15,93,76,0.04)] sm:p-5">
      <h2 className="text-lg font-black text-foreground">Refund a customer</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone giving money back must fill this in first. It records the order, who got the money, why, and who approved it.
      </p>

      <form onSubmit={onSubmit} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-muted-foreground sm:col-span-2">
          Order
          <select value={orderId} onChange={(e) => pickOrder(e.target.value)} className={field}>
            <option value="">Choose a paid order</option>
            {(orders.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                #{o.order_number || o.id.slice(0, 4).toUpperCase()} · {formatMoney(Number(o.total))} · {o.payment_method} · {formatTime(o.created_at)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          Amount refunded
          <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
        </label>

        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          Refunded by
          <select value={method} onChange={(e) => setMethod(e.target.value as "Cash" | "M-Pesa")} className={field}>
            <option value="Cash">Cash from drawer</option>
            <option value="M-Pesa">M-Pesa</option>
          </select>
        </label>

        <label className="grid gap-1 text-xs font-bold text-muted-foreground sm:col-span-2">
          {method === "M-Pesa" ? "Customer name and M-Pesa number" : "Customer name"}
          <input value={refundedTo} onChange={(e) => setRefundedTo(e.target.value)} placeholder={method === "M-Pesa" ? "e.g. Jane W, 0712 345 678" : "Who received the cash"} className={field} />
        </label>

        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          Reason
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>

        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          Approved by
          <select value={approverId} onChange={(e) => setApproverId(e.target.value)} className={field}>
            <option value="">Choose manager or supervisor</option>
            {approverChoices.map((a) => <option key={a.id} value={a.id}>{a.display_name} ({a.role})</option>)}
          </select>
        </label>

        <label className="grid gap-1 text-xs font-bold text-muted-foreground sm:col-span-2">
          What happened
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Customer ordered chicken, received beef" className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>

        {submitRefund.isError && (
          <p className="text-sm font-semibold text-destructive sm:col-span-2">
            {submitRefund.error instanceof Error ? submitRefund.error.message : "Unable to record refund."}
          </p>
        )}
        {submitRefund.isSuccess && <p className="text-sm font-semibold text-primary sm:col-span-2">Refund recorded.</p>}

        <button type="submit" disabled={submitRefund.isPending} className="h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60 sm:col-span-2">
          {submitRefund.isPending ? "Recording..." : "Record refund"}
        </button>
      </form>

      {showRecent && recent.data && recent.data.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-bold text-muted-foreground">Latest refunds</p>
          <div className="space-y-2">
            {recent.data.map((r) => (
              <div key={r.id} className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <div className="flex justify-between font-bold">
                  <span className="truncate">{r.refunded_to}</span>
                  <span>-{formatMoney(Number(r.amount))}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.reason} · {r.method} · approved by {r.authorized_by_name} ({r.authorization_role}) · {formatTime(r.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}