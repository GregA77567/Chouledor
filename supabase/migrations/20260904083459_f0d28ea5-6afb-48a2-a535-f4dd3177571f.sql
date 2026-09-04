ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_voter_id_fkey;
ALTER TABLE public.matches ALTER COLUMN our_score DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN their_score DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN our_score DROP DEFAULT;
ALTER TABLE public.matches ALTER COLUMN their_score DROP DEFAULT;