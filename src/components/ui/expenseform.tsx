import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const EXPENSE_CATEGORIES = [
  { value: "supplier", label: "Supplier purchase" },
  { value: "transport", label: "Transport" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];
type Approver = { id: string; display_name: string; role: "manager" | "supervisor" };
const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export default function ExpenseForm() {
  const { user, displayName } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"Cash" | "M-Pesa" | "Bank">("Cash");
  const [paidTo, setPaidTo] = useState("");
  const [category, setCategory] = useState("supplier");
  const [reason, setReason] = useState("");
  const [approverId, setApproverId] = useState("");
  const approvers = useQuery({ queryKey: ["approvers"], queryFn: async () => {
    const { data, error } = await (supabase as any).rpc("get_money_out_approvers");
    if (error) throw error;
    return (data ?? []) as Approver[];
  }});
  const activeShift = useQuery({ queryKey: ["active-shift", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await (supabase as any).from("staff_shifts").select("id").eq("user_id", user!.id).is("ended_at", null).maybeSingle();
    if (error) throw error;
    return data as { id: string } | null;
  }});
  const choices = (approvers.data ?? []).filter((approver) => approver.id !== user?.id);
  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      const approver = choices.find((item) => item.id === approverId);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an expense amount above zero.");
      if (paidTo.trim().length < 2) throw new Error("Enter who received the money.");
      if (reason.trim().length < 5) throw new Error("Explain why the expense was paid.");
      if (!approver) throw new Error("Choose the manager or supervisor who approved this.");
      const { error } = await (supabase as any).from("expenses").insert({
        shift_id: activeShift.data?.id ?? null, amount: value, method, paid_to: paidTo.trim(), category,
        reason: reason.trim(), authorized_by: approver.id, authorized_by_name: approver.display_name,
        authorization_role: approver.role, recorded_by: user!.id, recorded_by_name: displayName,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setAmount(""); setPaidTo(""); setReason(""); setApproverId(""); setCategory("supplier");
      await queryClient.invalidateQueries({ queryKey: ["expenses-history"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-cash-out"] });
    },
  });
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  return <section className="rounded-[26px] border border-border bg-card p-4 shadow-[0_10px_24px_rgba(15,93,76,0.04)] sm:p-5">
    <h2 className="text-lg font-black text-foreground">Record an expense</h2>
    <p className="mt-1 text-sm text-muted-foreground">Record who received the money, why it was paid, and the real manager or supervisor who approved it.</p>
    <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-bold text-muted-foreground">Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={field} /></label>
      <label className="grid gap-1 text-xs font-bold text-muted-foreground">Paid from<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className={field}><option>Cash</option><option>M-Pesa</option><option>Bank</option></select></label>
      <label className="grid gap-1 text-xs font-bold text-muted-foreground sm:col-span-2">Paid to<input value={paidTo} onChange={(event) => setPaidTo(event.target.value)} placeholder="Supplier or person" className={field} /></label>
      <label className="grid gap-1 text-xs font-bold text-muted-foreground">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className={field}>{EXPENSE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-muted-foreground">Approved by<select value={approverId} onChange={(event) => setApproverId(event.target.value)} className={field}><option value="">Choose manager or supervisor</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.display_name} ({item.role})</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-muted-foreground sm:col-span-2">Explanation<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></label>
      {mutation.isError && <p className="text-sm font-semibold text-destructive sm:col-span-2">{mutation.error instanceof Error ? mutation.error.message : "Unable to record expense."}</p>}
      {mutation.isSuccess && <p className="text-sm font-semibold text-primary sm:col-span-2">Expense recorded.</p>}
      <button type="submit" disabled={mutation.isPending} className="h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60 sm:col-span-2">{mutation.isPending ? "Recording..." : "Record expense"}</button>
    </form>
  </section>;
}