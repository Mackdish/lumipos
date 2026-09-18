import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const nav = [
  { to: "/", label: "Home", icon: "⌂" }, { to: "/new-order", label: "New order", icon: "+" },
  { to: "/orders", label: "Orders", icon: "▤" },
  { to: "/inventory", label: "Inventory", icon: "▦" }, { to: "/recipes", label: "Recipes", icon: "◈" },
  { to: "/daily-summary", label: "Summary", icon: "◔" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, displayName, isManager, role, profile, hotel, trial, trialActive, trialExpired, trialDaysRemaining, needsHotelSetup } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out failed:", error);
        return;
      }
      await router.navigate({ to: "/auth", replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth", replace: true });
    if (!loading && user && needsHotelSetup && pathname !== "/onboarding") router.navigate({ to: "/onboarding" });
  }, [loading, user, router, needsHotelSetup, pathname]);

  if (loading || !user) return <div className="grid min-h-screen place-items-center bg-background px-4 text-center text-sm text-muted-foreground">Loading your account...</div>;
  if (needsHotelSetup && pathname !== "/onboarding") return null;

  if (!role && !needsHotelSetup) {
    const rejected = profile?.approval_status === "rejected";
    return <main className="grid min-h-screen place-items-center bg-secondary px-5 py-10"><section className="w-full max-w-md rounded-3xl border border-border bg-card p-7 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">TB</div><h1 className="mt-5 text-2xl font-black">{rejected ? "Account not approved" : "Waiting for approval"}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{rejected ? "Your cashier account was not approved. Please contact your hotel manager." : "Your cashier account is awaiting approval by the hotel manager."}</p><button type="button" disabled={signingOut} onClick={handleSignOut} className="mt-6 min-h-11 rounded-xl border border-border px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">{signingOut ? "Signing out..." : "Sign out"}</button></section></main>;
  }

  if (trialExpired) return <main className="grid min-h-screen place-items-center bg-secondary px-5 py-10"><section className="w-full max-w-lg rounded-3xl border border-border bg-card p-7 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">TB</div><p className="mt-5 text-xs font-black uppercase tracking-[.18em] text-primary">{hotel?.name || "TillBook"} trial</p><h1 className="mt-2 text-3xl font-black tracking-tight">Your 7-day free trial has ended</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">The hotel account has reached the end of its free trial. Contact the account administrator to continue using TillBook.</p><div className="mt-6 rounded-2xl bg-muted p-4 text-sm"><p className="font-bold">Trial ended</p>{trial?.trial_ends_at && <p className="mt-1 text-muted-foreground">{new Date(trial.trial_ends_at).toLocaleDateString()}</p>}</div><button type="button" disabled={signingOut} onClick={handleSignOut} className="mt-6 min-h-11 rounded-xl border border-border px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">{signingOut ? "Signing out..." : "Sign out"}</button></section></main>;

  const links = isManager ? [...nav, { to: "/menu", label: "Menu", icon: "☰" }, { to: "/user-management", label: "Cashiers", icon: "♙" }] : nav;
  const mobileLinks = [links.find((item) => item.to === "/new-order")!, links.find((item) => item.to === "/orders")!, ...(isManager ? [links.find((item) => item.to === "/inventory")!, links.find((item) => item.to === "/menu")!] : [])];
  const isActive = (to: string) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
  const style = { "--primary": hotel?.primary_color || "#1f7a4d", "--ring": hotel?.primary_color || "#1f7a4d", "--sidebar-primary": hotel?.primary_color || "#1f7a4d", "--background": hotel?.secondary_color || "#f4f7f5" } as React.CSSProperties;

  return <div style={style} className="min-h-screen overflow-x-hidden bg-background text-foreground md:grid md:grid-cols-[244px_minmax(0,1fr)]">
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur md:hidden"><Link to="/" className="flex min-w-0 items-center gap-2.5">{hotel?.logo_url ? <img src={hotel.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-black text-primary-foreground">TB</span>}<span className="min-w-0"><b className="block truncate text-sm">{hotel?.name || "TillBook"}</b><span className="block truncate text-[10px] text-muted-foreground">{hotel?.tagline || "Hotel operations"}</span></span></Link><Link to="/new-order" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">+ New order</Link></header>
    <aside className="hidden min-h-screen border-r border-border bg-card p-4 md:sticky lg:top-0 md:flex md:h-screen md:flex-col"><Link to="/" className="mb-10 flex items-center gap-3 px-2 pt-2">{hotel?.logo_url ? <img src={hotel.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">TB</span>}<span className="min-w-0"><b className="block truncate text-sm">{hotel?.name || "TillBook"}</b><span className="block truncate text-xs text-muted-foreground">{hotel?.tagline || "Hotel operations"}</span></span></Link><nav aria-label="Main navigation" className="space-y-1">{links.map((item) => <Link key={item.to} to={item.to} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive(item.to) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><span aria-hidden="true" className="grid h-6 w-6 place-items-center text-base">{item.icon}</span>{item.label}</Link>)}</nav><div className="mt-auto border-t border-border pt-4">{trialActive && <p className="mb-3 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary">Free trial · {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"} left</p>}<p className="px-3 pb-3 text-xs text-muted-foreground">Signed in as <b className="block text-foreground">{displayName}</b></p><button type="button" disabled={signingOut} onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"><span aria-hidden="true" className="grid h-6 w-6 place-items-center">↪</span>{signingOut ? "Signing out..." : "Sign out"}</button></div></aside>
    <div className="min-w-0 pb-16 md:pb-0">{trialActive && trialDaysRemaining <= 2 && <div className="mx-4 mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-900 sm:mx-8 lg:mx-10">Your {hotel?.name || "hotel"} free trial ends in {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"}.</div>}{children}</div>
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(0,0,0,0.06)] backdrop-blur md:hidden"><div className={`mx-auto grid h-16 max-w-md ${isManager ? "grid-cols-6" : "grid-cols-5"}`}>{mobileLinks.map((item) => <Link key={item.to} to={item.to} className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold ${isActive(item.to) ? "text-primary" : "text-muted-foreground"}`}><span className={`grid h-7 w-10 place-items-center rounded-xl text-base ${isActive(item.to) ? "bg-primary/10" : ""}`}>{item.icon}</span><span className="truncate">{item.label}</span></Link>)}<button type="button" disabled={signingOut} onClick={handleSignOut} className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold text-destructive disabled:cursor-not-allowed disabled:opacity-60"><span className="grid h-7 w-10 place-items-center rounded-xl text-base">↪</span><span>{signingOut ? "Signing out" : "Sign out"}</span></button></div></nav>
  </div>;
}
