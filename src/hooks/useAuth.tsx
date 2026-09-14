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

export type Trial = {
  plan: string;
  trial_started_at: string;
  trial_ends_at: string;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [trialLoading, setTrialLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setRole(null);
      setTrial(null);
      setTrialLoading(false);
      return;
    }

    let active = true;
    setTrialLoading(true);

    supabase
      .from("profiles")
      .select("id, full_name, job_title, email, approval_status")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setProfile((data as Profile) ?? null);
      });

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setRole((data?.role as string) ?? null);
      });

    supabase
      .from("subscription_settings" as any)
      .select("plan, trial_started_at, trial_ends_at")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error("Unable to load trial status:", error);
        setTrial((data as Trial) ?? null);
        setTrialLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.["full_name"] as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Staff member";

  const trialEndsAt = trial ? new Date(trial.trial_ends_at).getTime() : 0;
  const trialActive = trial?.plan === "trial" && trialEndsAt > Date.now();
  const trialExpired = Boolean(trial && !trialActive);
  const trialDaysRemaining = trialActive
    ? Math.max(1, Math.ceil((trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    session,
    user,
    profile,
    role,
    trial,
    trialActive,
    trialExpired,
    trialDaysRemaining,
    isManager: role === "manager",
    isApproved: role === "manager" || role === "staff",
    displayName,
    loading: loading || trialLoading,
  };
}
