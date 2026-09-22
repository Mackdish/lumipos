import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import LoadingSpinner from "@/components/ui/loading-spinner";

const nav = [
  { to: "/", label: "Home"}, { to: "/new-order", label: "New order"},
  { to: "/orders", label: "Orders"},
  { to: "/inventory", label: "Inventory"}, { to: "/recipes", label: "Recipes"},
  { to: "/daily-summary", label: "Summary"},
];

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, displayName, isManager, role, profile, hotel, trial, trialActive, trialExpired, trialDaysRemaining, needsHotelSetup } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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
      setDrawerOpen(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth", replace: true });
    if (!loading && user && needsHotelSetup && pathname !== "/onboarding") router.navigate({ to: "/onboarding" });
  }, [loading, user, router, needsHotelSetup, pathname]);

  useEffect(() => {
    setDrawerOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  if (loading || !user) return <main className="grid min-h-screen place-items-center bg-background"><LoadingSpinner label="Preparing TillBook" /></main>;
  if (needsHotelSetup && pathname !== "/onboarding") return null;

  if (!role && !needsHotelSetup) {
    const rejected = profile?.approval_status === "rejected";
    return <main className="grid min-h-screen place-items-center bg-secondary px-5 py-10"><section className="w-full max-w-md rounded-3xl border border-border bg-card p-7 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">TB</div><h1 className="mt-5 text-2xl font-black">{rejected ? "Account not approved" : "Waiting for approval"}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{rejected ? "Your cashier account was not approved. Please contact your hotel manager." : "Your cashier account is awaiting approval by the hotel manager."}</p><button type="button" disabled={signingOut} onClick={handleSignOut} className="mt-6 min-h-11 rounded-xl border border-border px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">{signingOut ? "Signing out..." : "Sign out"}</button></section></main>;
  }

  if (trialExpired) return <main className="grid min-h-screen place-items-center bg-secondary px-5 py-10"><section className="w-full max-w-lg rounded-3xl border border-border bg-card p-7 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">TB</div><p className="mt-5 text-xs font-black uppercase tracking-[.18em] text-primary">{hotel?.name || "TillBook"} trial</p><h1 className="mt-2 text-3xl font-black tracking-tight">Your 7-day free trial has ended</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">The hotel account has reached the end of its free trial. Contact the account administrator to continue using TillBook.</p><div className="mt-6 rounded-2xl bg-muted p-4 text-sm"><p className="font-bold">Trial ended</p>{trial?.trial_ends_at && <p className="mt-1 text-muted-foreground">{new Date(trial.trial_ends_at).toLocaleDateString()}</p>}</div><button type="button" disabled={signingOut} onClick={handleSignOut} className="mt-6 min-h-11 rounded-xl border border-border px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">{signingOut ? "Signing out..." : "Sign out"}</button></section></main>;

  const links = isManager ? [...nav, { to: "/menu", label: "Menu"}, { to: "/refunds", label: "Refunds"}, { to: "/expenses", label: "Expenses"}, { to: "/user-management", label: "Cashiers"}, { to: "/settings", label: "Settings"}] : nav;
  const isActive = (to: string) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
  const textColor = hotel?.text_color || "#26383d";
  const style = { "--primary": hotel?.primary_color || "#496a72", "--ring": hotel?.primary_color || "#496a72", "--sidebar-primary": hotel?.primary_color || "#496a72", "--background": hotel?.secondary_color || "#f2f5f4", "--foreground": textColor, "--card-foreground": textColor, "--popover-foreground": textColor, "--accent-foreground": textColor, "--secondary-foreground": textColor, "--sidebar-foreground": textColor } as React.CSSProperties;
  const navItems = [
    { to: "/", label: "Home"},
    { to: "/new-order", label: "New Order"},
    { to: "/orders", label: "Orders"},
    { to: "/menu", label: "Menu"},
    { to: "/payments", label: "Payments"},
    { to: "/settings", label: "Settings"},
    { to: "/refunds", label: "Refunds"},
    { to: "/expenses", label: "Expenses"},
  ];
  const profileInitials = displayName.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase();

  return <div style={style} className="min-h-screen overflow-x-hidden bg-background text-foreground">
    {drawerOpen && <button type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden" />}
    {profileOpen && <button type="button" aria-label="Close profile details" onClick={() => setProfileOpen(false)} className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden" />}
    <div className="relative min-h-screen md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-border bg-card/80 p-4 shadow-[inset_-1px_0_0_rgba(17,77,62,0.08)] backdrop-blur-md md:sticky md:flex md:h-screen md:flex-col lg:top-0">
        <Link to="/" className="mb-8 flex items-center gap-3 rounded-2xl bg-primary/5 px-2 py-2.5">
          {hotel?.logo_url ? <img src={hotel.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">TB</span>}
          <span className="min-w-0"><b className="block truncate text-sm">{hotel?.name || "Hotel Name"}</b><span className="block truncate text-xs text-muted-foreground">{hotel?.tagline || "Hotel operations"}</span></span>
        </Link>
        <nav aria-label="Main navigation" className="space-y-1.5">{links.map((item) => <Link key={item.to} to={item.to} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${isActive(item.to) ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><span aria-hidden="true" className="grid h-6 w-6 place-items-center text-base"></span>{item.label}</Link>)}</nav>
        <div className="mt-auto border-t border-border pt-4">{trialActive && <p className="mb-3 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary">Free trial · {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"} left</p>}<p className="px-3 pb-3 text-xs text-muted-foreground">Signed in as <b className="block text-foreground">{displayName}</b></p><button type="button" disabled={signingOut} onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"><span aria-hidden="true" className="grid h-6 w-6 place-items-center">↪</span>{signingOut ? "Signing out..." : "Sign out"}</button></div>
      </aside>

      <div className="min-w-0 pt-16 md:pt-0">
        <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 shadow-sm backdrop-blur-md md:hidden">
          <button type="button" onClick={() => setDrawerOpen((open) => !open)} aria-label="Open navigation" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-muted text-lg font-semibold text-foreground">☰</button>
          <div className="flex flex-1 items-center justify-center px-2"><p className="truncate text-lg font-extrabold tracking-tight text-foreground">{hotel?.name || "Hotel Name"}</p></div>
          <button type="button" aria-label="Open profile details" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground shadow-sm">{profileInitials || "U"}</button>
        </header>
        <div className="pb-6 md:pb-0">{trialActive && trialDaysRemaining <= 2 && <div className="mx-4 mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-900 sm:mx-8 lg:mx-10">Your {hotel?.name || "hotel"} free trial ends in {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"}.</div>}{children}</div>
      </div>
    </div>

    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-[320px] transform flex-col border-r border-border bg-card px-4 pb-5 pt-4 shadow-2xl transition-transform duration-200 ease-out md:hidden ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
        <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation" className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-lg font-bold text-foreground">←</button>
        <div className="flex min-w-0 items-center gap-3">
          {hotel?.logo_url ? <img src={hotel.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-xs font-black text-primary-foreground">TB</span>}
          <div className="min-w-0"><p className="truncate text-sm font-extrabold text-foreground">{hotel?.name || "Hotel Name"}</p></div>
        </div>
      </div>

      <nav className="space-y-1.5">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold ${isActive(item.to) ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-black/5 text-base"></span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-border bg-muted/40 p-3">
        <p className="text-sm font-bold text-foreground">{hotel?.name || "Hotel Name"}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">LumiPOS v1.0.0</p>
        <button type="button" disabled={signingOut} onClick={handleSignOut} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-sm font-bold text-destructive disabled:opacity-60">{signingOut ? "Signing out..." : "Logout"}</button>
      </div>
    </aside>

    <aside className={`fixed inset-x-0 top-0 z-50 min-h-[25vh] transform rounded-b-3xl border-b border-border bg-card/95 p-5 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out md:hidden ${profileOpen ? "translate-y-0" : "-translate-y-full"}`} aria-label="Profile details">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-sm font-black text-primary-foreground">{profileInitials || "U"}</span>
          <div className="min-w-0"><p className="truncate text-base font-black text-foreground">{displayName}</p><p className="truncate text-sm text-muted-foreground">{user.email}</p></div>
        </div>
        <button type="button" aria-label="Close profile details" onClick={() => setProfileOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-muted text-lg font-bold text-foreground">×</button>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3 text-sm"><span className="text-muted-foreground">Role</span><span className="font-bold capitalize">{role || "Staff"}</span></div>
    </aside>
  </div>;
}
