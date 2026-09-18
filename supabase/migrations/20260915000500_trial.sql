-- TillBook: 7-day free trial for the current restaurant account.
-- The database project represents one restaurant account, so the trial is stored
-- as a singleton and is shared by the manager and approved cashiers.

CREATE TABLE IF NOT EXISTS public.subscription_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  plan TEXT NOT NULL DEFAULT 'trial',
  trial_started_at TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_trial_dates_valid CHECK (trial_ends_at > trial_started_at)
);

-- Start the initial trial today and make it exactly seven days long.
INSERT INTO public.subscription_settings (id, plan, trial_started_at, trial_ends_at)
VALUES (
  1,
  'trial',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '7 days'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.subscription_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view subscription" ON public.subscription_settings;
CREATE POLICY "Authenticated users can view subscription"
  ON public.subscription_settings
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.subscription_settings TO authenticated;

CREATE INDEX IF NOT EXISTS subscription_settings_trial_ends_idx
  ON public.subscription_settings (trial_ends_at);
