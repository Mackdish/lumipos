import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/user-management")({
  head: () => ({ meta: [{ title: "Cashiers | TillBook" }, { name: "description", content: "Create and manage cashiers for your hotel." }] }),
  component: UserManagement,
});

type Cashier = { user_id: string; role: string; status: string; profile: { full_name: string; email: string | null; job_title: string; approval_status: string; created_at: string } | null };
const db = supabase as any;

function UserManagement() {
  const { isManager, loading, hotel } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string; emailSent: boolean } | null>(null);

  const { data: cashiers = [], isLoading, isError } = useQuery<Cashier[]>({
    queryKey: ["hotel-cashiers", hotel?.id],
    enabled: !loading && isManager && !!hotel,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: members, error } = await db.from("hotel_memberships").select("user_id, role, status").eq("hotel_id", hotel.id).eq("role", "cashier").order("created_at", { ascending: false });
      if (error) throw error;
      if (!members?.length) return [];
      const ids = members.map((m: any) => m.user_id);
      const { data: profiles, error: profileError } = await db.from("profiles").select("id, full_name, email, job_title, approval_status, created_at").in("id", ids);
      if (profileError) throw profileError;
      return members.map((m: any) => ({ ...m, profile: profiles?.find((p: any) => p.id === m.user_id) ?? null }));
    },
  });

  async function createCashier(event: FormEvent) {
    event.preventDefault(); setBusy(true); setCredentials(null);
    const { data, error } = await supabase.functions.invoke("create-cashier", { body: { full_name: name.trim(), email: email.trim(), ...(password.trim() ? { password: password.trim() } : {}) } });
    setBusy(false);
    if (error || data?.error) { toast.error(error?.message || data?.error || "Unable to create cashier"); return; }
    setCredentials({ email: data.cashier.email, password: data.temporary_password, emailSent: Boolean(data.email_sent) });
    setName(""); setEmail(""); setPassword("");
    toast.success("Cashier account created");
    await queryClient.invalidateQueries({ queryKey: ["hotel-cashiers", hotel?.id] });
  }

  if (!loading && !isManager) return <AppShell><main className="mx-auto max-w-3xl px-5 py-16"><div className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access restricted</p><h1 className="mt-2 text-2xl font-bold">Managers only</h1></div></main></AppShell>;

  return <AppShell><main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
    <header><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{hotel?.name || "Hotel"}</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Cashier management</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Create cashier accounts for this hotel. Each cashier receives their own login credentials and can only access this hotel's workspace.</p></header>

    <section className="mt-6 grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <form onSubmit={createCashier} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="text-lg font-black">Create cashier</h2><p className="mt-1 text-xs text-muted-foreground">Leave the password empty to generate a secure temporary password.</p><div className="mt-5 space-y-4">
        <Field label="Full name"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Wanjiku" className={input} /></Field>
        <Field label="Login email"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cashier@hotel.co.ke" className={input} /></Field>
        <Field label="Temporary password"><input minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Auto-generate" className={input} /></Field>
        <button disabled={busy} type="submit" className="min-h-12 w-full rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-60">{busy ? "Creating cashier…" : "Create cashier account"}</button>
      </div></form>

      <div>
        {credentials && <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-5"><p className="text-sm font-black">Login credentials</p><p className="mt-1 text-xs text-muted-foreground">Give these credentials to the cashier. The password is shown only after creation.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Credential label="Email" value={credentials.email} /><Credential label="Temporary password" value={credentials.password} /></div><p className="mt-3 text-xs font-semibold">{credentials.emailSent ? "Credentials were also sent to the cashier's email." : "Email delivery is not configured; copy these credentials and send them securely."}</p></div>}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="border-b border-border px-5 py-4"><h2 className="font-black">Your cashiers</h2><p className="mt-1 text-xs text-muted-foreground">Only members of {hotel?.name || "this hotel"} appear here.</p></div>{isLoading ? <div className="space-y-3 p-5">{[1,2,3].map((n) => <div key={n} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div> : isError ? <p className="p-5 text-sm text-destructive">Unable to load cashiers.</p> : cashiers.length === 0 ? <div className="p-8 text-center"><p className="font-bold">No cashiers yet</p><p className="mt-1 text-sm text-muted-foreground">Create your first cashier using the form.</p></div> : <div className="divide-y divide-border">{cashiers.map((cashier) => <article key={cashier.user_id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-bold">{cashier.profile?.full_name || "Cashier"}</p><p className="truncate text-xs text-muted-foreground">{cashier.profile?.email || "No email"}</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase text-primary">{cashier.status}</span></article>)}</div>}</div>
      </div>
    </section>
  </main></AppShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-bold">{label}{children}</label>; }
function Credential({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 break-all font-mono text-sm font-bold">{value}</p></div>; }
const input = "mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring";
