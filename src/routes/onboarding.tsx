import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your hotel | TillBook" },
      { name: "description", content: "Create and brand your hotel account in TillBook." },
    ],
  }),
  component: OnboardingPage,
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1f7a4d");
  const [secondaryColor, setSecondaryColor] = useState("#f4f7f5");
  const [busy, setBusy] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slug || slug === slugify(name)) setSlug(slugify(value));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("create_hotel_profile", {
      hotel_name: name.trim(),
      hotel_slug: slugify(slug),
      hotel_tagline: tagline.trim() || null,
      hotel_logo_url: logoUrl.trim() || null,
      hotel_primary_color: primaryColor,
      hotel_secondary_color: secondaryColor,
      hotel_phone: phone.trim() || null,
      hotel_email: email.trim() || null,
      hotel_address: address.trim() || null,
    } as any);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Hotel profile created");
    window.location.href = "/";
    await router.navigate({ to: "/" });
  }

  return (
    <main className="min-h-screen bg-secondary px-5 py-8 sm:grid sm:place-items-center sm:py-12">
      <section className="w-full max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-9">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">TB</div>
          <div><p className="text-xs font-black uppercase tracking-[.17em] text-primary">TillBook setup</p><p className="text-sm text-muted-foreground">Create your hotel account</p></div>
        </div>
        <div className="mt-7">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Step 1 · Hotel profile</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Set up your hotel</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">This account becomes the hotel owner. Your menu, orders, inventory, staff and reports will be isolated to this hotel.</p>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hotel name" required><input required value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Mackdish Hotel" className={input} /></Field>
            <Field label="Hotel URL slug" required><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="mackdish-hotel" className={input} /></Field>
          </div>
          <Field label="Tagline"><input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Comfort. Food. Service." className={input} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254..." className={input} /></Field>
            <Field label="Business email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@hotel.co.ke" className={input} /></Field>
          </div>
          <Field label="Address"><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Town, County" className={input} /></Field>
          <Field label="Logo URL"><input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://.../logo.png" className={input} /></Field>

          <div className="rounded-2xl border border-border p-4">
            <p className="text-sm font-black">Branding</p>
            <p className="mt-1 text-xs text-muted-foreground">These colors will be used throughout the hotel workspace.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl border border-input p-3 text-sm font-semibold">Primary <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="ml-auto h-10 w-14 cursor-pointer rounded" /></label>
              <label className="flex items-center gap-3 rounded-xl border border-input p-3 text-sm font-semibold">Background <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="ml-auto h-10 w-14 cursor-pointer rounded" /></label>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => supabase.auth.signOut().then(() => router.navigate({ to: "/auth" }))} className="min-h-12 rounded-xl border border-border px-5 text-sm font-bold">Sign out</button>
            <button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-primary px-6 text-sm font-black text-primary-foreground disabled:opacity-60">{busy ? "Creating hotel…" : "Create hotel & continue"}</button>
          </div>
        </form>
      </section>
    </main>
  );
}

const input = "mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring";
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-sm font-bold">{label}{required && <span className="ml-1 text-destructive">*</span>}{children}</label>;
}
