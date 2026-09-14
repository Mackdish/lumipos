import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/user-management")({
  head: () => ({
    meta: [
      { title: "User management | LumiPOS" },
      { name: "description", content: "Review and approve cashier staff accounts." },
    ],
  }),
  component: UserManagement,
});

type StaffProfile = {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
};

const db = supabase as any;

function UserManagement() {
  const { isManager, loading } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: profiles = [], isLoading, isError, error } = useQuery<StaffProfile[]>({
    queryKey: ["staff-management"],
    enabled: !loading && isManager,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id, full_name, email, job_title, approval_status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StaffProfile[];
    },
  });

  const visible = useMemo(
    () => filter === "all" ? profiles : profiles.filter((profile) => profile.approval_status === filter),
    [filter, profiles],
  );

  const pendingCount = profiles.filter((profile) => profile.approval_status === "pending").length;
  const approvedCount = profiles.filter((profile) => profile.approval_status === "approved").length;

  async function changeApproval(id: string, action: "approve" | "reject") {
    setBusyId(id);
    const functionName = action === "approve" ? "approve_staff_member" : "reject_staff_member";
    const { error } = await supabase.rpc(functionName, { target_user_id: id } as any);
    setBusyId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(action === "approve" ? "Cashier approved" : "Staff account rejected");
    await queryClient.invalidateQueries({ queryKey: ["staff-management"] });
  }

  if (!loading && !isManager) {
    return (
      <AppShell>
        <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access restricted</p>
            <h1 className="mt-2 text-2xl font-bold">Managers only</h1>
            <p className="mt-3 text-sm text-muted-foreground">Only managers can review and approve cashier accounts.</p>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Administration</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">User management</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review cashier registrations and approve staff before they can access the POS.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-64">
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="mt-1 text-2xl font-black">{pendingCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="mt-1 text-2xl font-black">{approvedCount}</p>
            </div>
          </div>
        </header>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {(["pending", "approved", "rejected", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold capitalize ${filter === value ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {value}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="mt-5 space-y-3">
            {[1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : isError ? (
          <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
            {error instanceof Error ? error.message : "Unable to load staff accounts."}
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="font-bold">No {filter === "all" ? "staff accounts" : `${filter} accounts`}</p>
            <p className="mt-1 text-sm text-muted-foreground">New cashier registrations will appear here.</p>
          </div>
        ) : (
          <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_140px_180px] gap-4 border-b border-border px-5 py-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground sm:grid">
              <span>Staff member</span><span>Role</span><span>Status</span><span>Action</span>
            </div>
            <div className="divide-y divide-border">
              {visible.map((profile) => (
                <article key={profile.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_140px_180px] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{profile.full_name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{profile.email || "No email recorded"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Registered {new Date(profile.created_at).toLocaleString("en-KE")}</p>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">{profile.job_title || "Cashier"}</span>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${profile.approval_status === "pending" ? "bg-amber-500/10 text-amber-700" : profile.approval_status === "approved" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                      {profile.approval_status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {profile.approval_status !== "approved" && (
                      <button type="button" disabled={busyId === profile.id} onClick={() => changeApproval(profile.id, "approve")} className="min-h-10 flex-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50 sm:flex-none">
                        {busyId === profile.id ? "Working…" : "Approve"}
                      </button>
                    )}
                    {profile.approval_status !== "rejected" && (
                      <button type="button" disabled={busyId === profile.id} onClick={() => changeApproval(profile.id, "reject")} className="min-h-10 rounded-xl border border-destructive/20 px-3 text-xs font-bold text-destructive hover:bg-destructive/5 disabled:opacity-50">
                        Reject
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
