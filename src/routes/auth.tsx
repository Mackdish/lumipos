import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in | Bingo Hotel Order Book" },
      {
        name: "description",
        content:
          "Sign in to the Bingo Hotel order book to record food orders, payments and daily takings.",
      },
      { property: "og:title", content: "Staff sign in | Bingo Hotel Order Book" },
      {
        property: "og:description",
        content: "Secure staff sign in for the Bingo Hotel food order book.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.navigate({ to: "/" });
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: fullName || email.split("@")[0] },
        },
      });
      setBusy(false);
      setMessage(
        error
          ? error.message
          : "Account created. Check your email for the confirmation link, then sign in.",
      );
      if (!error) setMode("signin");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else router.navigate({ to: "/" });
  }

  async function google() {
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) setMessage(error.message);
  }

  return (
    <main className="min-h-screen bg-secondary px-5 py-10 sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-[460px] rounded-3xl bg-card px-7 py-9 shadow-xl sm:px-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">
            BH
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.17em] text-primary">Bingo Hotel</p>
            <p className="text-sm text-muted-foreground">Food order book</p>
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">
          {mode === "signin" ? "Sign in to start your shift" : "Create your staff account"}
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          Every order you record is saved to the hotel database under your name.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <div>
              <label htmlFor="fullName" className="text-sm font-bold">
                Full name
              </label>
              <input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring"
                placeholder="Jane Wanjiku"
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="text-sm font-bold">
              Work email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring"
              placeholder="you@bingohotel.co.ke"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-bold">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring"
              placeholder="At least 6 characters"
            />
          </div>

          {message && (
            <p role="alert" className="rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-5 py-4 font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
          >
            {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <button
          onClick={google}
          className="mt-3 w-full rounded-xl border border-input bg-background px-5 py-3.5 font-bold transition hover:bg-muted"
        >
          Continue with Google
        </button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New staff member?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage("");
            }}
            className="font-bold text-primary underline"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </section>
    </main>
  );
}
