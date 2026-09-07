import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AWARDS, initials, type Award, type Match, type Player, type Vote } from "@/lib/choules";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Le Choule d'Or — Vote de l'homme du match" },
      {
        name: "description",
        content:
          "Après chaque match, les joueurs du club votent pour la Choule d'Or, d'Argent, de Bronze et le Dommage.",
      },
      { property: "og:title", content: "Le Choule d'Or — Vote de l'homme du match" },
      {
        property: "og:description",
        content:
          "Après chaque match, les joueurs du club votent pour la Choule d'Or, d'Argent, de Bronze et le Dommage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Step = "vote" | "done";

const VOTER_KEY = "choules-device-id";

function getDeviceId(): string {
  const existing = window.localStorage.getItem(VOTER_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(VOTER_KEY, id);
  return id;
}

const awardStyle: Record<Award, { ring: string; chip: string; text: string }> = {
  or: {
    ring: "ring-gold/50",
    chip: "bg-gold text-background",
    text: "text-gold",
  },
  argent: {
    ring: "ring-silver/40",
    chip: "bg-silver text-background",
    text: "text-silver",
  },
  bronze: {
    ring: "ring-bronze/40",
    chip: "bg-bronze text-background",
    text: "text-bronze",
  },
  dommage: {
    ring: "ring-violet/40",
    chip: "bg-violet text-background",
    text: "text-violet",
  },
};

function useClubData() {
  return useQuery({
    queryKey: ["club-data"],
    queryFn: async () => {
      const [playersRes, matchRes] = await Promise.all([
        supabase.from("players").select("*").order("number"),
        supabase
          .from("matches")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (playersRes.error) throw playersRes.error;
      if (matchRes.error) throw matchRes.error;
      const match = matchRes.data as Match | null;
      let votes: Vote[] = [];
      let votedIds: string[] = [];
      let voterIds: string[] = [];
      if (match) {
        const [votersRes, votedRes] = await Promise.all([
          supabase.from("match_voters").select("player_id").eq("match_id", match.id),
          supabase.rpc("match_voted_ids", { _match_id: match.id }),
        ]);
        if (votersRes.error) throw votersRes.error;
        if (votedRes.error) throw votedRes.error;
        voterIds = (votersRes.data ?? []).map((r) => r.player_id);
        votedIds = ((votedRes.data ?? []) as { voter_id: string }[]).map((r) => r.voter_id);
        if (match.is_revealed) {
          const { data, error } = await supabase.from("votes").select("*").eq("match_id", match.id);
          if (error) throw error;
          votes = (data ?? []) as Vote[];
        }
      }
      return {
        players: (playersRes.data ?? []) as Player[],
        match,
        votes,
        votedIds,
        voterIds,
      };
    },
  });
}

function Index() {
  const { data, isLoading, error } = useClubData();
  const queryClient = useQueryClient();

  const [voterId, setVoterId] = useState<string | null>(null);
  useEffect(() => {
    setVoterId(getDeviceId());
  }, []);
  const [step, setStep] = useState<Step>("vote");
  const [selection, setSelection] = useState<Partial<Record<Award, string>>>({});
  const [activeAward, setActiveAward] = useState<Award>("or");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const match = data?.match ?? null;
  const allPlayers = useMemo(() => data?.players ?? [], [data]);
  const votes = useMemo(() => data?.votes ?? [], [data]);
  const votedIds = useMemo(() => data?.votedIds ?? [], [data]);
  const voterIds = useMemo(() => data?.voterIds ?? [], [data]);

  // Joueurs présents au match (sinon, tout l'effectif)
  const players = useMemo(
    () => (voterIds.length ? allPlayers.filter((p) => voterIds.includes(p.id)) : allPlayers),
    [allPlayers, voterIds],
  );

  const alreadyVoted = match && voterId ? votedIds.includes(voterId) : false;
  const revealed = Boolean(match?.is_revealed);
  const votingOpen = Boolean(match?.is_open);

  const results = useMemo(() => {
    const tally = new Map<string, Record<Award, number>>();
    for (const v of votes) {
      const entry = tally.get(v.player_id) ?? { or: 0, argent: 0, bronze: 0, dommage: 0 };
      entry[v.award] += 1;
      tally.set(v.player_id, entry);
    }
    return AWARDS.map((a) => {
      const ranked = allPlayers
        .map((p) => ({ player: p, count: tally.get(p.id)?.[a.key] ?? 0 }))
        .filter((r) => r.count > 0)
        .sort((x, y) => y.count - x.count);
      return { award: a, winner: ranked[0] ?? null };
    });
  }, [votes, allPlayers]);

  const voterCount = votedIds.length;


  const assignedCount = Object.values(selection).filter(Boolean).length;


  function assign(playerId: string) {
    setSelection((prev) => {
      const next = { ...prev };
      // Un-assign this player from any other award (un joueur = un prix)
      for (const key of Object.keys(next) as Award[]) {
        if (next[key] === playerId && key !== activeAward) delete next[key];
      }
      if (next[activeAward] === playerId) {
        delete next[activeAward];
      } else {
        next[activeAward] = playerId;
      }
      return next;
    });
    // Move to the next unassigned award
    const nextFree = AWARDS.find(
      (a) => a.key !== activeAward && !selection[a.key],
    );
    if (nextFree) setActiveAward(nextFree.key);
  }

  async function submit() {
    if (!match || !voterId) return;
    const rows = (Object.entries(selection) as [Award, string][]).map(([award, playerId]) => ({
      match_id: match.id,
      voter_id: voterId,
      player_id: playerId,
      award,
    }));
    if (rows.length !== 4) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error: insertError } = await supabase.from("votes").insert(rows);
    setSubmitting(false);
    if (insertError) {
      setSubmitError(
        insertError.code === "23505"
          ? "Tu as déjà voté pour ce match — un vote par joueur !"
          : "Impossible d'enregistrer le vote. Réessaie.",
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["club-data"] });
    setStep("done");
  }

  return (
    <div className="min-h-screen bg-background pb-32 text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-full bg-gradient-to-b from-foreground via-gold to-background font-display text-lg text-background ring-1 ring-gold/40">
              C
            </div>
            <div className="leading-none">
              <div className="font-display text-base tracking-wide">LE CHOULE D'OR</div>
              <div className="mt-1 text-[9px] tracking-[0.25em] text-muted-foreground">
                LE VOTE DU VESTIAIRE
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-[10px] text-muted-foreground">
              {voterCount} / {players.length} votants
            </div>
            <Link
              to="/admin"
              className="rounded-full bg-surface px-2.5 py-1 font-mono text-[9px] tracking-[0.15em] text-muted-foreground ring-1 ring-line"
            >
              ADMIN
            </Link>
          </div>

        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-6">
        {isLoading && (
          <div className="py-20 text-center font-mono text-xs text-muted-foreground">
            Chargement de la feuille de match…
          </div>
        )}

        {error && (
          <div className="py-20 text-center font-mono text-xs text-violet">
            Erreur de chargement. Recharge la page.
          </div>
        )}

        {!isLoading && !error && !match && (
          <div className="animate-rise rounded-2xl bg-gradient-to-b from-bronze via-surface to-surface-2 p-5 ring-1 ring-gold/20">
            <div className="font-display text-xl tracking-wide">AUCUN MATCH OUVERT</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Reviens juste après le prochain match pour attribuer tes choules.
            </p>
          </div>
        )}

        {!isLoading && !error && match && (
          <>
            {/* Match card */}
            <div className="animate-rise relative overflow-hidden rounded-2xl bg-gradient-to-b from-bronze via-surface to-surface-2 p-5 ring-1 ring-gold/20">
              <div className="absolute -right-6 -top-6 size-28 rounded-full bg-gradient-to-b from-foreground via-gold/70 to-background opacity-40" />
              <div className="relative">
                <div className="font-mono text-[10px] tracking-[0.2em] text-gold/80">
                  MATCH DU JOUR ·{" "}
                  {new Date(match.played_on + "T00:00:00").toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  }).toUpperCase()}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-2xl tracking-tight">LE CHOULE</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {match.our_score} — {match.their_score}
                    </div>
                  </div>
                  <div className="shrink-0 origin-center rotate-90 font-mono text-[10px] text-muted-foreground">
                    VS
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl uppercase tracking-tight">
                      {match.opponent}
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {match.their_score} — {match.our_score}
                    </div>
                  </div>
                </div>
                {match.note && (
                  <div className="mt-4 border-t border-line pt-4 text-sm text-foreground/80">
                    {match.note}
                  </div>
                )}
              </div>
            </div>

            {/* Vote ouvert à tous */}
            {step === "vote" && !alreadyVoted && votingOpen && (

              <>
                <div className="mt-4 grid grid-cols-4 gap-1.5">
                  {AWARDS.map((a, i) => {
                    const active = activeAward === a.key;
                    const filled = Boolean(selection[a.key]);
                    return (
                      <button
                        key={a.key}
                        onClick={() => setActiveAward(a.key)}
                        className={`animate-rise rounded-lg bg-surface px-1 py-2 text-center ring-1 transition-all ${
                          active ? awardStyle[a.key].ring + " bg-surface-2" : "ring-line"
                        }`}
                        style={{ animationDelay: `${80 + i * 60}ms` }}
                      >
                        <div
                          className={`mx-auto grid size-7 place-items-center rounded-full bg-gradient-to-b from-foreground to-background font-display text-[10px] text-background ring-1 ${
                            a.key === "or"
                              ? "via-gold ring-gold/50"
                              : a.key === "argent"
                                ? "via-silver ring-silver/40"
                                : a.key === "bronze"
                                  ? "via-bronze ring-bronze/40"
                                  : "via-violet ring-violet/40"
                          }`}
                        >
                          {a.short}
                        </div>
                        <div className="mt-1.5 text-center text-[9px] leading-tight text-foreground/90">
                          {a.label}
                        </div>
                        {filled && <div className="mt-0.5 text-[9px] text-gold">✓</div>}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <h2 className="font-display text-lg tracking-wide">LA LISTE</h2>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {assignedCount} / 4 attribuées
                  </div>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Prix actif :{" "}
                  <span className={awardStyle[activeAward].text + " font-semibold"}>
                    {AWARDS.find((a) => a.key === activeAward)?.label}
                  </span>{" "}
                  — touche un joueur pour lui décerner.
                </p>

                <div className="mt-3 space-y-2.5">
                  {players.map((p, i) => {
                    const award = (Object.entries(selection) as [Award, string][]).find(
                      ([, pid]) => pid === p.id,
                    )?.[0];
                    const isVoter = p.id === voterId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => !isVoter && assign(p.id)}
                        disabled={isVoter}
                        className={`animate-rise flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left ring-1 transition-all active:scale-[0.99] ${
                          award ? awardStyle[award].ring : "ring-line hover:bg-surface-2"
                        } ${isVoter ? "opacity-50" : ""}`}
                        style={{ animationDelay: `${200 + i * 30}ms` }}
                      >
                        <div className="relative shrink-0">
                          <div className="grid size-14 place-items-center rounded-full bg-gradient-to-b from-foreground via-silver to-background font-display text-lg text-background ring-1 ring-line">
                            {initials(p.name)}
                          </div>
                          {award && (
                            <div
                              className={`animate-medal-pop absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-gradient-to-b from-foreground to-background font-display text-[10px] text-background ring-1 ${
                                award === "or"
                                  ? "via-gold ring-gold/60"
                                  : award === "argent"
                                    ? "via-silver ring-silver/50"
                                    : award === "bronze"
                                      ? "via-bronze ring-bronze/50"
                                      : "via-violet ring-violet/50"
                              }`}
                            >
                              {AWARDS.find((a) => a.key === award)?.short}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Nº {p.number}
                            </span>
                            <span className="truncate text-sm font-semibold">
                              {p.name}
                              {isVoter && " (toi)"}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {p.position}
                            {p.tagline ? ` · ${p.tagline}` : ""}
                          </div>
                        </div>
                        {award ? (
                          <div
                            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${awardStyle[award].chip} ${
                              award === "or" ? "animate-pulse-glow" : ""
                            }`}
                          >
                            {AWARDS.find((a) => a.key === award)?.label.replace("Choule ", "")}
                          </div>
                        ) : (
                          <div className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground/80 ring-1 ring-line">
                            {isVoter ? "—" : "Choisir"}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Sous scellés : voté mais résultats non dévoilés */}
            {!revealed && (step === "done" || alreadyVoted || !votingOpen) && (
              <div className="animate-rise mt-4 rounded-2xl bg-surface p-5 text-center ring-1 ring-gold/30">
                <div className="mx-auto grid size-12 place-items-center rounded-full bg-gradient-to-b from-foreground via-gold to-background font-display text-lg text-background ring-1 ring-gold/40">
                  🔒
                </div>
                <div className="mt-3 font-display text-lg tracking-wide text-gold">
                  {step === "done" || alreadyVoted ? "VOTE ENREGISTRÉ" : "VOTES CLÔTURÉS"}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Les résultats restent sous scellés jusqu'à ce que l'administrateur les dévoile.
                </p>
                <div className="mt-4 font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
                  {voterCount} / {players.length} VOTANTS
                </div>
              </div>
            )}

            {/* Résultats dévoilés */}
            {revealed && (
              <>
                <div className="mt-6 flex items-center justify-between">
                  <h2 className="font-display text-lg tracking-wide">LE POINT DU VESTIAIRE</h2>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {voterCount} / {players.length} votants
                  </div>
                </div>

                <div className="mt-3 space-y-2.5">
                  {results.map(({ award, winner }, i) => (
                    <div
                      key={award.key}
                      className={`animate-rise flex items-center gap-3 rounded-xl bg-surface p-4 ring-1 ${
                        winner ? awardStyle[award.key].ring : "ring-line"
                      }`}
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <div
                        className={`grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-foreground to-background font-display text-xs text-background ring-1 ${
                          award.key === "or"
                            ? "via-gold ring-gold/50"
                            : award.key === "argent"
                              ? "via-silver ring-silver/40"
                              : award.key === "bronze"
                                ? "via-bronze ring-bronze/40"
                                : "via-violet ring-violet/40"
                        }`}
                      >
                        {award.short}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`font-mono text-[10px] tracking-[0.2em] ${awardStyle[award.key].text}`}>
                          {award.label.toUpperCase()}
                        </div>
                        <div className="mt-0.5 truncate text-sm font-semibold">
                          {winner ? winner.player.name : "Personne pour l'instant"}
                        </div>
                      </div>
                      {winner && (
                        <div className="shrink-0 font-mono text-xs text-muted-foreground">
                          {winner.count} vote{winner.count > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-center font-mono text-[10px] text-muted-foreground">
                  Les votes restent anonymes — comme au vestiaire.
                </p>
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom bar */}
      {match && step === "vote" && !alreadyVoted && votingOpen && isEligible && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-background/95 backdrop-blur-sm">
          <div className="mx-auto max-w-md px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-mono text-[10px] text-muted-foreground">PROGRESSION</div>
              <div className="font-mono text-[10px] text-foreground">{assignedCount} / 4</div>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-gradient-to-r from-gold via-gold to-background transition-all"
                style={{ width: `${(assignedCount / 4) * 100}%` }}
              />
            </div>
            {submitError && (
              <div className="mt-2 text-center text-xs text-violet">{submitError}</div>
            )}
            <button
              onClick={submit}
              disabled={assignedCount !== 4 || submitting}
              className="mt-3 w-full rounded-full bg-gradient-to-b from-gold via-gold to-bronze py-3.5 font-display text-base tracking-wide text-background ring-1 ring-gold/60 transition-transform active:scale-[0.99] disabled:opacity-40"
            >
              {submitting ? "ENVOI…" : "VALIDER MON VOTE"}
            </button>
            <div className="mt-2 text-center font-mono text-[10px] text-muted-foreground">
              Ton vote est anonyme · comme au vestiaire
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
