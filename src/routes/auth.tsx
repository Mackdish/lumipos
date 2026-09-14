import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in | LumiPOS" },
      { name: "description", content: "Secure staff sign in and cashier registration for LumiPOS." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const { user, loading, role, profile } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && role) router.navigate({ to: "/" });
  }, [loading, user, role, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: fullName.trim() || email.split("@")[0] },
        },
      });

      if (error) {
        setBusy(false);
        setMessage(error.message);
        return;
      }

      // Supabase may automatically create a session when email confirmation is disabled.
      // Do not leave a newly registered cashier signed in before manager approval.
      if (data.session) await supabase.auth.signOut();
      setBusy(false);
      setMode("signin");
      setMessage("Registration submitted. A manager must approve your cashier account before you can access LumiPOS.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.navigate({ to: "/" });
  }

  return (
    <main className="min-h-screen bg-secondary px-5 py-10 sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-[460px] rounded-3xl bg-card px-7 py-9 shadow-xl sm:px-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">LP</div>
          <div><p className="text-xs font-bold uppercase tracking-[.17em] text-primary">LumiPOS</p><p className="text-sm text-muted-foreground">Restaurant operations</p></div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">
          {mode === "signin" ? "Sign in to LumiPOS" : "Register as a cashier"}
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          {mode === "signin"
            ? "Use your approved staff account to access the POS."
            : "Create your cashier account. A manager will review and approve it before you can use the POS."}
        </p>

        {user && !role && profile?.approval_status && (
          <div className={`mt-5 rounded-2xl border p-4 text-sm ${profile.approval_status === "rejected" ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5"}`}>
            <p className="font-bold">{profile.approval_status === "rejected" ? "Registration not approved" : "Waiting for manager approval"}</p>
            <p className="mt-1 text-muted-foreground">
              {profile.approval_status === "rejected" ? "Please contact the manager if you believe this was a mistake." : "Your account is registered, but POS access is locked until a manager approves you."}
            </p>
            <button type="button" onClick={() => supabase.auth.signOut()} className="mt-3 font-bold text-primary underline">Sign out</button>
          </div>
        )}

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && <div><label htmlFor="fullName" className="text-sm font-bold">Full name</label><input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring" placeholder="Jane Wanjiku" /></div>}
          <div><label htmlFor="email" className="text-sm font-bold">Work email</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring" placeholder="cashier@restaurant.co.ke" /></div>
          <div><label htmlFor="password" className="text-sm font-bold">Password</label><input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring" placeholder="At least 6 characters" /></div>
          {message && <p role="alert" className="rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground">{message}</p>}
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-5 py-4 font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70">{busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Submit registration"}<span aria-hidden="true">→</span></button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New cashier?" : "Already registered?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }} className="font-bold text-primary underline">{mode === "signin" ? "Register here" : "Sign in"}</button>
        </p>
      </section>
    </main>
  );
}
