import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string;
  job_title: string;
  email?: string | null;
  approval_status?: "pending" | "approved" | "rejected";
};

export type Hotel = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
};

export type Trial = {
  plan: string;
  trial_started_at: string;
  trial_ends_at: string;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [hasHotelMembership, setHasHotelMembership] = useState(false);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [trialLoading, setTrialLoading] = useState(true);
  // Keep the application in the loading state until the membership query has
  // completed. This prevents AppShell from interpreting the initial false
  // membership state as "needs onboarding" during the first render.
  const [accountDataLoading, setAccountDataLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession?.user) {
        setAccountDataLoading(false);
      } else {
        setAccountDataLoading(true);
      }
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setAccountDataLoading(Boolean(data.session?.user));
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setHotel(null);
      setRole(null);
      setHasHotelMembership(false);
      setTrial(null);
      setTrialLoading(false);
      setAccountDataLoading(false);
      return;
    }

    let active = true;
    setTrialLoading(true);
    setAccountDataLoading(true);
    setHasHotelMembership(false);

    Promise.all([
      supabase.from("profiles").select("id, full_name, job_title, email, approval_status").eq("id", user.id).maybeSingle(),
      (supabase as any).from("hotel_memberships").select("hotel_id, role, status").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]).then(async ([profileResult, membershipResult]) => {
      if (!active) return;
      if (profileResult.error) console.error("Unable to load profile:", profileResult.error);
      if (membershipResult.error) console.error("Unable to load hotel membership:", membershipResult.error);
      setProfile((profileResult.data as Profile) ?? null);

      // Only a confirmed active membership means onboarding is complete.
      const membership = membershipResult.data as { hotel_id: string; role: string } | null;
      const membershipExists = Boolean(membership?.hotel_id);
      setHasHotelMembership(membershipExists);
      setRole(membership?.role === "owner" ? "manager" : membership?.role === "cashier" ? "staff" : membership?.role ?? null);

      if (!membership?.hotel_id) {
        setHotel(null);
        setTrial(null);
        setTrialLoading(false);
        setAccountDataLoading(false);
        return;
      }

      const [{ data: hotelData, error: hotelError }, { data: trialData, error: trialError }] = await Promise.all([
        (supabase as any).from("hotels").select("id, name, slug, tagline, logo_url, primary_color, secondary_color, phone, email, address, currency").eq("id", membership.hotel_id).maybeSingle(),
        (supabase as any).from("hotel_subscriptions").select("plan, trial_started_at, trial_ends_at").eq("hotel_id", membership.hotel_id).maybeSingle(),
      ]);
      if (!active) return;
      if (hotelError) console.error("Unable to load hotel profile:", hotelError);
      if (trialError) console.error("Unable to load trial status:", trialError);
      setHotel((hotelData as Hotel) ?? null);
      setTrial((trialData as Trial) ?? null);
      setTrialLoading(false);
      setAccountDataLoading(false);
    }).catch((error) => {
      if (!active) return;
      console.error("Unable to initialize account:", error);
      setTrialLoading(false);
      setAccountDataLoading(false);
    });

    return () => { active = false; };
  }, [user]);

  const displayName = profile?.full_name || (user?.user_metadata?.["full_name"] as string | undefined) || user?.email?.split("@")[0] || "Hotel owner";
  const trialEndsAt = trial ? new Date(trial.trial_ends_at).getTime() : 0;
  const trialActive = trial?.plan === "trial" && trialEndsAt > Date.now();
  const trialExpired = Boolean(trial && !trialActive);
  const trialDaysRemaining = trialActive ? Math.max(1, Math.ceil((trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  return {
    session, user, profile, hotel, role, trial, trialActive, trialExpired, trialDaysRemaining,
    isManager: role === "manager", isApproved: role === "manager" || role === "staff",
    needsHotelSetup: Boolean(user && !hasHotelMembership), displayName,
    loading: loading || accountDataLoading || trialLoading,
  };
}
