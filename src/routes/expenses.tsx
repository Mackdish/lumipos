import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import ExpenseForm, { EXPENSE_CATEGORIES } from "@/components/ui/expenseform";
import MoneyOutHistory, { type MoneyOutRow } from "@/routes/moneyouthistory";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/expenses")({ component: ExpensesPage });
function ExpensesPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["expenses-history"], queryFn: async () => {
    const { data, error } = await (supabase as any).from("expenses").select("id, amount, method, paid_to, category, reason, authorized_by_name, authorization_role, recorded_by_name, created_at").order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    return data ?? [];
  }});
  const rows: MoneyOutRow[] = (data ?? []).map((expense: any) => ({
    id: expense.id, amount: Number(expense.amount), title: expense.paid_to, detail: expense.reason,
    badge: EXPENSE_CATEGORIES.find((item) => item.value === expense.category)?.label ?? "Other",
    method: expense.method, approvedBy: expense.authorized_by_name, approverRole: expense.authorization_role,
    recordedBy: expense.recorded_by_name, createdAt: expense.created_at,
  }));
  return <AppShell><main className="mx-auto max-w-7xl px-3 pb-28 pt-3 sm:px-6 sm:pt-6 lg:px-10 lg:pb-10">
    <section className="rounded-[28px] border border-border bg-card p-4 shadow-[0_10px_24px_rgba(15,93,76,0.07)] sm:p-6"><h1 className="text-[1.75rem] font-black tracking-[-0.03em] text-foreground sm:text-[2rem]">Expenses</h1><p className="mt-2 text-sm text-muted-foreground">Every expense, who received it, why it was paid, and who approved it.</p></section>
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.3fr)]"><ExpenseForm /><MoneyOutHistory title="Expense history" rows={rows} isLoading={isLoading} isError={isError} emptyText="No expenses match these filters." /></div>
  </main></AppShell>;
}