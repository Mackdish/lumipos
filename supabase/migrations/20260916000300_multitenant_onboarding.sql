-- TillBook: finish the multi-tenant onboarding model.
-- New self-signups become unassigned accounts until they create a hotel.
-- Existing accounts remain mapped to the migrated default hotel.

-- Fix the default-hotel owner assignment from the previous migration.
DO $$
DECLARE
  owner_user_id UUID;
  default_hotel_id UUID;
BEGIN
  SELECT id INTO default_hotel_id FROM public.hotels ORDER BY created_at LIMIT 1;
  SELECT user_id INTO owner_user_id
  FROM public.user_roles
  WHERE role::TEXT = 'manager'
  ORDER BY user_id
  LIMIT 1;

  IF default_hotel_id IS NOT NULL AND owner_user_id IS NOT NULL THEN
    UPDATE public.hotel_memberships
    SET role = CASE WHEN user_id = owner_user_id THEN 'owner' ELSE role END
    WHERE hotel_id = default_hotel_id;
  END IF;
END $$;

-- Replace the old single-owner signup trigger. A new account has no hotel and
-- therefore no POS role until the owner completes hotel onboarding.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, job_title, email, approval_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'Hotel owner',
    NEW.email,
    'pending'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;

-- Tenant-aware subscription/trial records.
CREATE TABLE IF NOT EXISTS public.hotel_subscriptions (
  hotel_id UUID PRIMARY KEY REFERENCES public.hotels(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'trial',
  trial_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hotel_subscription_trial_dates_valid CHECK (trial_ends_at > trial_started_at)
);

INSERT INTO public.hotel_subscriptions (hotel_id, plan, trial_started_at, trial_ends_at)
SELECT h.id, COALESCE(s.plan, 'trial'),
       COALESCE(s.trial_started_at, now()),
       COALESCE(s.trial_ends_at, now() + INTERVAL '7 days')
FROM public.hotels h
LEFT JOIN public.subscription_settings s ON s.id = 1
ON CONFLICT (hotel_id) DO NOTHING;

ALTER TABLE public.hotel_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hotel_subscription_select ON public.hotel_subscriptions;
CREATE POLICY hotel_subscription_select ON public.hotel_subscriptions FOR SELECT TO authenticated
USING (hotel_id = public.current_hotel_id());
GRANT SELECT ON public.hotel_subscriptions TO authenticated;

-- Ensure subscription timestamps stay current when edited server-side.
CREATE OR REPLACE FUNCTION public.set_hotel_subscription_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hotel_subscriptions_updated_at ON public.hotel_subscriptions;
CREATE TRIGGER hotel_subscriptions_updated_at
BEFORE UPDATE ON public.hotel_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_hotel_subscription_updated_at();
