import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const nav = [
  { to: "/", label: "Home", icon: "⌂" },
  { to: "/new-order", label: "New order", icon: "+" },
  { to: "/orders", label: "Orders", icon: "▤" },
  { to: "/daily-summary", label: "Summary", icon: "◔" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, displayName, isManager } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth" });
  }, [loading, user, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center bg-background px-4 text-center text-sm text-muted-foreground">Loading your shift...</div>;
  }

  const links = isManager ? [...nav, { to: "/menu", label: "Menu", icon: "☰" }] : nav;
  const mobileLinks = links.slice(0, 4);
  const isActive = (to: string) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-black text-primary-foreground">BH</span>
          <span className="min-w-0"><b className="block truncate text-sm">Bingo Hotel</b><span className="block text-[10px] text-muted-foreground">Food operations</span></span>
        </Link>
        <Link to="/new-order" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">+ New order</Link>
      </header>

      <aside className="hidden min-h-screen border-r border-border bg-card p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link to="/" className="mb-10 flex items-center gap-3 px-2 pt-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">BH</span>
          <span><b className="block text-sm">Bingo Hotel</b><span className="block text-xs text-muted-foreground">Food operations</span></span>
        </Link>
        <nav aria-label="Main navigation" className="space-y-1">
          {links.map((item) => <Link key={item.to} to={item.to} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive(item.to) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><span aria-hidden="true" className="grid h-6 w-6 place-items-center text-base">{item.icon}</span>{item.label}</Link>)}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <p className="px-3 pb-3 text-xs text-muted-foreground">Signed in as <b className="block text-foreground">{displayName}</b></p>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"><span aria-hidden="true" className="grid h-6 w-6 place-items-center">↪</span>End shift</button>
        </div>
      </aside>

      <div className="min-w-0 pb-16 lg:pb-0">{children}</div>

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-4">
          {mobileLinks.map((item) => <Link key={item.to} to={item.to} className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold ${isActive(item.to) ? "text-primary" : "text-muted-foreground"}`}><span className={`grid h-7 w-10 place-items-center rounded-xl text-base ${isActive(item.to) ? "bg-primary/10" : ""}`}>{item.icon}</span><span className="truncate">{item.label}</span></Link>)}
        </div>
      </nav>
    </div>
  );
}
