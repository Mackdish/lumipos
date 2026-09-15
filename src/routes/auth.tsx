import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in | TillBook" }, { name: "description", content: "Sign in to TillBook or create a hotel owner account." }] }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const { user, loading, hotel, role } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && hotel && role) router.navigate({ to: "/" });
    if (!loading && user && !hotel) router.navigate({ to: "/onboarding" });
  }, [loading, user, hotel, role, router]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { emailRedirectTo: `${window.location.origin}/onboarding`, data: { full_name: fullName.trim() || email.split("@")[0] } },
      });
      if (error) { setBusy(false); setMessage(error.message); return; }
      if (data.session) { setBusy(false); await router.navigate({ to: "/onboarding" }); return; }
      setBusy(false); setMode("signin");
      setMessage("Account created. Check your email if confirmation is required, then sign in to create your hotel profile.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    await router.navigate({ to: "/" });
  }

  return <main className="min-h-screen bg-secondary px-5 py-10 sm:grid sm:place-items-center"><section className="mx-auto w-full max-w-[460px] rounded-3xl bg-card px-7 py-9 shadow-xl sm:px-10">
    <div className="mb-8 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">TB</div><div><p className="text-xs font-bold uppercase tracking-[.17em] text-primary">TillBook</p><p className="text-sm text-muted-foreground">Hotel management platform</p></div></div>
    <h1 className="text-3xl font-bold tracking-tight">{mode === "signin" ? "Sign in to TillBook" : "Create your hotel account"}</h1>
    <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{mode === "signin" ? "Sign in as a hotel owner, manager or cashier." : "Create your owner account, then set up and brand your hotel."}</p>
    <form onSubmit={submit} className="mt-8 space-y-4">
      {mode === "signup" && <div><label htmlFor="fullName" className="text-sm font-bold">Full name</label><input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} placeholder="Jane Wanjiku" /></div>}
      <div><label htmlFor="email" className="text-sm font-bold">Email</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="owner@hotel.co.ke" /></div>
      <div><label htmlFor="password" className="text-sm font-bold">Password</label><input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder="At least 6 characters" /></div>
      {message && <p role="alert" className="rounded-xl bg-muted px-3 py-2.5 text-sm">{message}</p>}
      <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-5 py-4 font-bold text-primary-foreground disabled:opacity-70">{busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}<span>→</span></button>
    </form>
    <p className="mt-6 text-center text-sm text-muted-foreground">{mode === "signin" ? "New hotel owner?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }} className="font-bold text-primary underline">{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
  </section></main>;
}
const input = "mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring";
