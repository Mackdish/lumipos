-- Start a seven-day trial automatically for every newly created hotel.
CREATE OR REPLACE FUNCTION public.create_hotel_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hotel_subscriptions (hotel_id, plan, trial_started_at, trial_ends_at)
  VALUES (NEW.id, 'trial', now(), now() + INTERVAL '7 days')
  ON CONFLICT (hotel_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotels_create_trial ON public.hotels;
CREATE TRIGGER hotels_create_trial
AFTER INSERT ON public.hotels
FOR EACH ROW EXECUTE FUNCTION public.create_hotel_trial();
