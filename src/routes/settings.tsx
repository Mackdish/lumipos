import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | LumiPOS" },
      { name: "description", content: "Customize your restaurant branding and theme." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { hotel, isManager, loading } = useAuth();
  const [primaryColor, setPrimaryColor] = useState(hotel?.primary_color || "#1f7a4d");
  const [secondaryColor, setSecondaryColor] = useState(hotel?.secondary_color || "#f4f7f5");
  const [textColor, setTextColor] = useState(hotel?.text_color || "#26383d");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hotel) return;
    setPrimaryColor(hotel.primary_color || "#1f7a4d");
    setSecondaryColor(hotel.secondary_color || "#f4f7f5");
    setTextColor(hotel.text_color || "#26383d");
  }, [hotel]);

  async function saveTheme() {
    if (!hotel || saving) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("update_hotel_branding", {
        hotel_name: hotel.name,
        hotel_tagline: hotel.tagline,
        hotel_logo_url: hotel.logo_url,
        hotel_primary_color: primaryColor,
        hotel_secondary_color: secondaryColor,
        hotel_text_color: textColor,
        hotel_phone: hotel.phone,
        hotel_email: hotel.email,
        hotel_address: hotel.address,
      });
      if (error) throw error;

      const { data: saved, error: verifyError } = await (supabase as any)
        .from("hotels")
        .select("primary_color, secondary_color, text_color")
        .eq("id", hotel.id)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (!saved || saved.primary_color !== primaryColor || saved.secondary_color !== secondaryColor || saved.text_color !== textColor) {
        throw new Error("The theme could not be verified after saving. Please try again.");
      }

      toast.success("Restaurant theme updated.");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the restaurant theme.");
    } finally {
      setSaving(false);
    }
  }

  if (!loading && !isManager) {
    return <AppShell><main className="mx-auto max-w-3xl px-5 py-16 sm:px-8"><div className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access restricted</p><h1 className="mt-2 text-2xl font-bold">Managers only</h1><p className="mt-3 text-sm text-muted-foreground">Ask a manager to change restaurant settings.</p></div></main></AppShell>;
  }

  return <AppShell><main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
    <header><p className="text-xs font-bold uppercase tracking-[.18em] text-muted-foreground">Restaurant settings</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Make it yours</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choose the colours that your team will see throughout the POS.</p></header>
    <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-bold">Restaurant theme</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use your brand colour for actions and a softer colour for the workspace background.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="rounded-2xl border border-border p-4 text-sm font-semibold">Primary colour<input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="mt-3 h-14 w-full cursor-pointer rounded-xl border-0 bg-transparent p-0" /><span className="mt-2 block font-mono text-xs font-normal text-muted-foreground">{primaryColor}</span></label>
          <label className="rounded-2xl border border-border p-4 text-sm font-semibold">Workspace colour<input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="mt-3 h-14 w-full cursor-pointer rounded-xl border-0 bg-transparent p-0" /><span className="mt-2 block font-mono text-xs font-normal text-muted-foreground">{secondaryColor}</span></label>
          <label className="rounded-2xl border border-border p-4 text-sm font-semibold">Text colour<input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="mt-3 h-14 w-full cursor-pointer rounded-xl border-0 bg-transparent p-0" /><span className="mt-2 block font-mono text-xs font-normal text-muted-foreground">{textColor}</span></label>
        </div>
        <button type="button" onClick={saveTheme} disabled={saving || !hotel} className="mt-6 min-h-12 w-full rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{saving ? "Saving theme…" : "Save theme"}</button>
      </div>
      <div className="rounded-2xl border border-border p-5 shadow-sm" style={{ backgroundColor: secondaryColor, color: textColor }}><p className="text-xs font-bold uppercase tracking-wider" style={{ color: primaryColor }}>Live preview</p><div className="mt-4 rounded-2xl bg-card p-4 shadow-sm"><p className="font-bold">{hotel?.name || "Your restaurant"}</p><p className="mt-1 text-sm" style={{ color: textColor, opacity: 0.7 }}>A fresh workspace for your team.</p><button type="button" className="mt-4 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: primaryColor }}>Primary action</button></div></div>
    </section>
  </main></AppShell>;
}
