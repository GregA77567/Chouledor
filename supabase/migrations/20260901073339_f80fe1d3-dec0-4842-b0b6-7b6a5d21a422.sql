create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number int not null,
  position text not null default 'Joueur',
  tagline text not null default ''
);

GRANT SELECT ON public.players TO anon;
GRANT SELECT ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players are readable by everyone"
ON public.players FOR SELECT TO anon, authenticated USING (true);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  opponent text not null,
  our_score int not null,
  their_score int not null,
  played_on date not null default current_date,
  note text not null default '',
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

GRANT SELECT ON public.matches TO anon;
GRANT SELECT ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Matches are readable by everyone"
ON public.matches FOR SELECT TO anon, authenticated USING (true);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  voter_id uuid not null references public.players(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  award text not null check (award in ('or','argent','bronze','dommage')),
  created_at timestamptz not null default now(),
  unique (match_id, voter_id, award)
);

GRANT SELECT, INSERT ON public.votes TO anon;
GRANT SELECT, INSERT ON public.votes TO authenticated;
GRANT ALL ON public.votes TO service_role;

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes are readable by everyone"
ON public.votes FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can cast a vote"
ON public.votes FOR INSERT TO anon, authenticated WITH CHECK (true);

insert into public.players (name, number, position, tagline) values
  ('Jérôme P.', 1, 'Gardien', 'La main de fer'),
  ('Théo L.', 4, 'Défenseur', '14 tacles par match'),
  ('Marc D.', 5, 'Défenseur', '0 regret'),
  ('Karim B.', 7, 'Attaquant', 'Le héros du vestiaire'),
  ('Yassine M.', 10, 'Milieu', 'Le dribble de dingue'),
  ('Lucas F.', 9, 'Attaquant', 'Renard des surfaces'),
  ('Sofiane A.', 11, 'Ailier', 'Fusée du couloir'),
  ('Nabil H.', 3, 'Défenseur', 'Le mur'),
  ('Rayan B.', 8, 'Milieu', 'Poumons infinis'),
  ('Hugo L.', 2, 'Défenseur', 'Toujours placé'),
  ('Paulo M.', 21, 'Gardien', 'Le remplaçant de luxe'),
  ('Adrien C.', 6, 'Milieu', 'Le métronome');

insert into public.matches (opponent, our_score, their_score, played_on, note, is_open) values
  ('US Coing', 3, 2, current_date, 'Victoire 3-2 après un but à la 90''. Le vestiaire est en feu. Attribue tes choules.', true);