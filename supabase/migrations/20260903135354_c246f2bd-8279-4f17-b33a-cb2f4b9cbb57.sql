ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_revealed boolean NOT NULL DEFAULT false;

CREATE TABLE public.match_voters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);

GRANT SELECT ON public.match_voters TO anon, authenticated;
GRANT ALL ON public.match_voters TO service_role;

ALTER TABLE public.match_voters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match voters are readable by everyone"
ON public.match_voters FOR SELECT
TO anon, authenticated
USING (true);

-- Résultats secrets : les votes ne sont lisibles qu'une fois dévoilés
DROP POLICY IF EXISTS "Votes are readable by everyone" ON public.votes;

CREATE POLICY "Votes readable once revealed"
ON public.votes FOR SELECT
TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.matches m WHERE m.id = votes.match_id AND m.is_revealed));

-- Savoir qui a déjà voté, sans révéler les choix
CREATE OR REPLACE FUNCTION public.match_voted_ids(_match_id uuid)
RETURNS TABLE (voter_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT v.voter_id FROM public.votes v WHERE v.match_id = _match_id;
$$;

GRANT EXECUTE ON FUNCTION public.match_voted_ids(uuid) TO anon, authenticated;