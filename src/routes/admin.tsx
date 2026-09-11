import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  addPlayer,
  adminLogin,
  adminLogout,
  adminOverview,
  adminStatus,
  createMatch,
  removePlayer,
  setMatchState,
  setMatchVoters,
  updateMatch,
} from "@/lib/admin.functions";
import { AWARDS, initials, type Award } from "@/lib/choules";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Administration — Le Choule d'Or" },
      {
        name: "description",
        content:
          "Espace administrateur : configurer le match du jour, convoquer les votants et clôturer les votes.",
      },
      { property: "og:title", content: "Administration — Le Choule d'Or" },
      {
        property: "og:description",
        content: "Configurer le match du jour, convoquer les votants et dévoiler les résultats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const queryClient = useQueryClient();
  const login = useServerFn(adminLogin);
  const logout = useServerFn(adminLogout);
  const status = useQuery({ queryKey: ["admin-status"], queryFn: () => adminStatus() });

  const unlocked = status.data?.unlocked ?? false;

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <div className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <div className="leading-none">
            <div className="font-display text-base tracking-wide">ADMINISTRATION</div>
            <div className="mt-1 font-mono text-[9px] tracking-[0.25em] text-muted-foreground">
              LE CHOULE D'OR
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-full bg-surface px-2.5 py-1 font-mono text-[9px] tracking-[0.15em] text-muted-foreground ring-1 ring-line"
            >
              VESTIAIRE
            </Link>
            {unlocked && (
              <button
                onClick={async () => {
                  await logout();
                  await queryClient.invalidateQueries();
                }}
                className="rounded-full bg-surface px-2.5 py-1 font-mono text-[9px] tracking-[0.15em] text-violet ring-1 ring-line"
              >
                QUITTER
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-6">
        {status.isLoading && (
          <div className="py-20 text-center font-mono text-xs text-muted-foreground">
            Vérification…
          </div>
        )}
        {!status.isLoading &&
          (unlocked ? (
            <AdminPanel />
          ) : (
            <LoginForm
              onSubmit={async (password) => {
                const res = await login({ data: { password } });
                if (res.ok) await queryClient.invalidateQueries();
                return res.ok;
              }}
            />
          ))}
      </div>
    </div>
  );
}

function LoginForm({ onSubmit }: { onSubmit: (password: string) => Promise<boolean> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSubmit(password);
        setBusy(false);
        setError(!ok);
      }}
      className="animate-rise rounded-2xl bg-gradient-to-b from-bronze via-surface to-surface-2 p-5 ring-1 ring-gold/20"
    >
      <div className="font-display text-xl tracking-wide">ACCÈS RÉSERVÉ</div>
      <p className="mt-2 text-sm text-muted-foreground">
        Entre le mot de passe administrateur pour configurer le match.
      </p>
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mot de passe"
        className="mt-4 w-full rounded-xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-line outline-none placeholder:text-muted-foreground focus:ring-gold/50"
      />
      {error && <div className="mt-2 text-xs text-violet">Mot de passe incorrect.</div>}
      <button
        type="submit"
        disabled={busy || !password}
        className="mt-4 w-full rounded-full bg-gradient-to-b from-gold via-gold to-bronze py-3 font-display text-base tracking-wide text-background ring-1 ring-gold/60 disabled:opacity-40"
      >
        {busy ? "…" : "ENTRER"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl bg-background px-3 py-2.5 text-sm text-foreground ring-1 ring-line outline-none placeholder:text-muted-foreground focus:ring-gold/50";

function AdminPanel() {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminOverview() });

  const saveVoters = useServerFn(setMatchVoters);
  const saveState = useServerFn(setMatchState);
  const newMatch = useServerFn(createMatch);
  const editMatch = useServerFn(updateMatch);
  const newPlayer = useServerFn(addPlayer);
  const delPlayer = useServerFn(removePlayer);

  const players = overview.data?.players ?? [];
  const current = overview.data?.current ?? null;
  const votes = useMemo(() => overview.data?.votes ?? [], [overview.data]);

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    setSelected(overview.data?.voterIds ?? []);
  }, [overview.data?.voterIds]);

  const [form, setForm] = useState<{
    opponent: string;
    our_score: string;
    their_score: string;
    played_on: string;
    note: string;
  }>({
    opponent: "",
    our_score: "",
    their_score: "",
    played_on: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const [edit, setEdit] = useState({
    opponent: "",
    our_score: "",
    their_score: "",
    played_on: new Date().toISOString().slice(0, 10),
    note: "",
  });
  useEffect(() => {
    if (!current) return;
    setEdit({
      opponent: current.opponent,
      our_score: current.our_score === null ? "" : String(current.our_score),
      their_score: current.their_score === null ? "" : String(current.their_score),
      played_on: current.played_on,
      note: current.note ?? "",
    });
  }, [current]);
  const [showNew, setShowNew] = useState(false);
  const [newP, setNewP] = useState({ name: "", position: "Joueur" });
  const [busy, setBusy] = useState(false);

  const votedIds = useMemo(() => new Set(votes.map((v) => v.voter_id)), [votes]);

  const POINTS: Record<Exclude<Award, "dommage">, number> = { or: 3, argent: 2, bronze: 1 };

  const results = useMemo(() => {
    const tally = new Map<string, Record<Award, number>>();
    for (const v of votes) {
      const entry = tally.get(v.player_id) ?? { or: 0, argent: 0, bronze: 0, dommage: 0 };
      entry[v.award as Award] += 1;
      tally.set(v.player_id, entry);
    }
    const podium = players
      .map((p) => {
        const t = tally.get(p.id);
        const points = t ? t.or * POINTS.or + t.argent * POINTS.argent + t.bronze * POINTS.bronze : 0;
        return { player: p, points, counts: t ?? { or: 0, argent: 0, bronze: 0, dommage: 0 } };
      })
      .filter((r) => r.points > 0)
      .sort((x, y) => y.points - x.points);
    const dommage = players
      .map((p) => ({ player: p, count: tally.get(p.id)?.dommage ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((x, y) => y.count - x.count);
    return { podium, dommage };
  }, [votes, players]);

  async function refresh() {
    await queryClient.invalidateQueries();
  }

  if (overview.isLoading) {
    return (
      <div className="py-20 text-center font-mono text-xs text-muted-foreground">Chargement…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Match courant */}
      <section className="animate-rise rounded-2xl bg-gradient-to-b from-bronze via-surface to-surface-2 p-5 ring-1 ring-gold/20">
        <div className="font-mono text-[10px] tracking-[0.2em] text-gold/80">MATCH DU JOUR</div>
        {current ? (
          <>
            <div className="mt-2 font-display text-2xl uppercase tracking-tight">
              vs {current.opponent}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {current.our_score ?? "–"} — {current.their_score ?? "–"} ·{" "}
              {new Date(current.played_on + "T00:00:00").toLocaleDateString("fr-FR")}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px]">
              <span
                className={`rounded-full px-2.5 py-1 ring-1 ${
                  current.is_open ? "text-gold ring-gold/40" : "text-muted-foreground ring-line"
                }`}
              >
                {current.is_open ? "VOTES OUVERTS" : "VOTES FERMÉS"}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 ring-1 ${
                  current.is_revealed
                    ? "text-silver ring-silver/40"
                    : "text-muted-foreground ring-line"
                }`}
              >
                {current.is_revealed ? "RÉSULTATS DÉVOILÉS" : "RÉSULTATS SOUS SCELLÉS"}
              </span>
              <span className="rounded-full px-2.5 py-1 text-muted-foreground ring-1 ring-line">
                {votedIds.size} VOTE{votedIds.size > 1 ? "S" : ""}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await saveState({
                    data: {
                      matchId: current.id,
                      is_open: !current.is_open,
                      is_revealed: current.is_revealed,
                    },
                  });
                  setBusy(false);
                  await refresh();
                }}
                className="rounded-full bg-surface px-3 py-2.5 font-mono text-[10px] tracking-[0.15em] ring-1 ring-line"
              >
                {current.is_open ? "FERMER LES VOTES" : "ROUVRIR LES VOTES"}
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await saveState({
                    data: {
                      matchId: current.id,
                      is_open: current.is_revealed ? current.is_open : false,
                      is_revealed: !current.is_revealed,
                    },
                  });
                  setBusy(false);
                  await refresh();
                }}
                className="rounded-full bg-gradient-to-b from-gold via-gold to-bronze px-3 py-2.5 font-mono text-[10px] tracking-[0.15em] text-background ring-1 ring-gold/60"
              >
                {current.is_revealed ? "MASQUER" : "CLÔTURER & DÉVOILER"}
              </button>
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
                MODIFIER LA FEUILLE DE MATCH
              </div>
              <div className="mt-3 space-y-2">
                <input
                  value={edit.opponent}
                  onChange={(e) => setEdit({ ...edit, opponent: e.target.value })}
                  placeholder="Adversaire"
                  className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    value={edit.our_score}
                    onChange={(e) => setEdit({ ...edit, our_score: e.target.value })}
                    placeholder="Nous"
                    className="rounded-xl bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none"
                  />
                  <input
                    type="number"
                    value={edit.their_score}
                    onChange={(e) => setEdit({ ...edit, their_score: e.target.value })}
                    placeholder="Eux"
                    className="rounded-xl bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none"
                  />
                  <input
                    type="date"
                    value={edit.played_on}
                    onChange={(e) => setEdit({ ...edit, played_on: e.target.value })}
                    className="rounded-xl bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none"
                  />
                </div>
                <input
                  value={edit.note}
                  onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                  placeholder="Note du match (optionnel)"
                  className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none"
                />
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await editMatch({
                      data: {
                        matchId: current.id,
                        opponent: edit.opponent,
                        our_score: edit.our_score === "" ? null : Number(edit.our_score),
                        their_score: edit.their_score === "" ? null : Number(edit.their_score),
                        played_on: edit.played_on,
                        note: edit.note,
                      },
                    });
                    setBusy(false);
                    await refresh();
                  }}
                  className="w-full rounded-full bg-surface-2 px-3 py-2.5 font-mono text-[10px] tracking-[0.15em] ring-1 ring-line"
                >
                  ENREGISTRER LA FEUILLE DE MATCH
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun match enregistré. Crée le match du jour ci-dessous.
          </p>
        )}
      </section>

      {/* Convocation */}
      {current && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg tracking-wide">JOUEURS PRÉSENTS</h2>
            <div className="font-mono text-[10px] text-muted-foreground">
              {selected.length} sélectionnés
            </div>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Coche les joueurs présents au match : ce sont eux qui apparaissent dans la liste de vote.
          </p>
          <div className="mt-3 space-y-2">
            {players.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    setSelected((prev) =>
                      prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                    )
                  }
                  className={`flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left ring-1 transition-colors ${
                    on ? "ring-gold/50" : "ring-line"
                  }`}
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-foreground via-silver to-background font-display text-xs text-background ring-1 ring-line">
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {p.position}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] ${
                      on ? "bg-gold text-background" : "bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    {on ? "PRÉSENT" : "ABSENT"}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelected(players.map((p) => p.id))}
              className="rounded-full bg-surface px-3 py-2.5 font-mono text-[10px] tracking-[0.15em] ring-1 ring-line"
            >
              TOUT COCHER
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await saveVoters({ data: { matchId: current.id, voterIds: selected } });
                setBusy(false);
                await refresh();
              }}
              className="rounded-full bg-surface-2 px-3 py-2.5 font-mono text-[10px] tracking-[0.15em] text-gold ring-1 ring-gold/40"
            >
              ENREGISTRER
            </button>
          </div>
        </section>
      )}

      {/* Résultats (admin uniquement) */}
      {current && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg tracking-wide">RÉSULTATS EN DIRECT</h2>
            <div className="font-mono text-[10px] text-muted-foreground">
              {votedIds.size} vote{votedIds.size > 1 ? "s" : ""}
            </div>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Visibles par toi seul tant que tu n'as pas dévoilé les résultats. Or = 3 pts · Argent = 2 pts · Bronze = 1 pt
          </p>

          <div className="mt-3 space-y-2.5">
            {results.podium.length === 0 && (
              <div className="rounded-xl bg-surface p-4 text-center font-mono text-xs text-muted-foreground ring-1 ring-line">
                Aucun point attribué
              </div>
            )}
            {results.podium.map((r, i) => {
              const medal =
                i === 0
                  ? { ring: "ring-gold/50", via: "via-gold ring-gold/50", text: "text-gold" }
                  : i === 1
                    ? { ring: "ring-silver/40", via: "via-silver ring-silver/40", text: "text-silver" }
                    : i === 2
                      ? { ring: "ring-bronze/40", via: "via-bronze ring-bronze/40", text: "text-bronze" }
                      : { ring: "ring-line", via: "via-silver ring-line", text: "text-muted-foreground" };
              return (
                <div
                  key={r.player.id}
                  className={`flex items-center gap-3 rounded-xl bg-surface p-4 ring-1 ${medal.ring}`}
                >
                  <div
                    className={`grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-foreground to-background font-display text-sm text-background ring-1 ${medal.via}`}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`font-mono text-[10px] tracking-[0.2em] ${medal.text}`}>
                      {i === 0 ? "CHOULE D'OR" : i === 1 ? "CHOULE D'ARGENT" : i === 2 ? "CHOULE DE BRONZE" : `N° ${i + 1}`}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold">{r.player.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {r.counts.or > 0 && `${r.counts.or} OR `}
                      {r.counts.argent > 0 && `${r.counts.argent} ARG `}
                      {r.counts.bronze > 0 && `${r.counts.bronze} BR`}
                    </div>
                  </div>
                  <div className="shrink-0 font-display text-lg text-gold">
                    {r.points}
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">pts</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <h2 className="font-display text-lg tracking-wide text-violet">LE DOMMAGE</h2>
          </div>
          <div className="mt-3 space-y-2.5">
            {results.dommage.length === 0 && (
              <div className="rounded-xl bg-surface p-4 text-center font-mono text-xs text-muted-foreground ring-1 ring-line">
                Personne — un match sans casse
              </div>
            )}
            {results.dommage.map((r, i) => (
              <div
                key={r.player.id}
                className={`flex items-center gap-3 rounded-xl bg-surface p-4 ring-1 ${
                  i === 0 ? "ring-violet/40" : "ring-line"
                }`}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-foreground via-violet to-background font-display text-sm text-background ring-1 ring-violet/40">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.player.name}</div>
                </div>
                <div className="shrink-0 font-mono text-xs text-muted-foreground">
                  {r.count} vote{r.count > 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Nouveau match */}
      <section>
        <h2 className="font-display text-lg tracking-wide">NOUVEAU MATCH</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Prépare la feuille de match à l'avance — le score peut rester vide et être complété plus tard. Les joueurs cochés ci-dessus seront la liste de vote.
        </p>
        <div className="mt-3 space-y-2">
          <input
            className={inputClass}
            placeholder="Adversaire"
            value={form.opponent}
            onChange={(e) => setForm({ ...form, opponent: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              type="number"
              placeholder="Nos buts"
              value={form.our_score}
              onChange={(e) => setForm({ ...form, our_score: e.target.value })}
            />
            <input
              className={inputClass}
              type="number"
              placeholder="Leurs buts"
              value={form.their_score}
              onChange={(e) => setForm({ ...form, their_score: e.target.value })}
            />
          </div>
          <input
            className={inputClass}
            type="date"
            value={form.played_on}
            onChange={(e) => setForm({ ...form, played_on: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Note du vestiaire (optionnel)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <button
            disabled={busy || !form.opponent.trim()}
            onClick={async () => {
              setBusy(true);
              await newMatch({
                data: {
                  opponent: form.opponent,
                  our_score: form.our_score === "" ? null : Number(form.our_score),
                  their_score: form.their_score === "" ? null : Number(form.their_score),
                  played_on: form.played_on,
                  note: form.note,
                  voterIds: selected,
                },
              });
              setBusy(false);
              setForm({ ...form, opponent: "", our_score: "", their_score: "", note: "" });
              await refresh();
            }}
            className="w-full rounded-full bg-gradient-to-b from-gold via-gold to-bronze py-3 font-display text-base tracking-wide text-background ring-1 ring-gold/60 disabled:opacity-40"
          >
            OUVRIR LE VOTE
          </button>
        </div>
      </section>

      {/* Effectif */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg tracking-wide">L'EFFECTIF</h2>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="rounded-full bg-surface px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] ring-1 ring-line"
          >
            {showNew ? "FERMER" : "+ JOUEUR"}
          </button>
        </div>
        {showNew && (
          <div className="mt-3 space-y-2 rounded-xl bg-surface p-3 ring-1 ring-line">
            <input
              className={inputClass}
              placeholder="Nom"
              value={newP.name}
              onChange={(e) => setNewP({ ...newP, name: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Poste"
              value={newP.position}
              onChange={(e) => setNewP({ ...newP, position: e.target.value })}
            />
            <button
              disabled={busy || !newP.name.trim()}
              onClick={async () => {
                setBusy(true);
                await newPlayer({ data: newP });
                setBusy(false);
                setNewP({ name: "", position: "Joueur" });
                await refresh();
              }}
              className="w-full rounded-full bg-surface-2 py-2.5 font-mono text-[10px] tracking-[0.15em] text-gold ring-1 ring-gold/40 disabled:opacity-40"
            >
              AJOUTER
            </button>
          </div>
        )}
        <div className="mt-3 space-y-1.5">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 ring-1 ring-line"
            >
              <span className="truncate text-sm">{p.name}</span>
              <button
                onClick={async () => {
                  await delPlayer({ data: { id: p.id } });
                  await refresh();
                }}
                className="shrink-0 font-mono text-[10px] text-violet"
              >
                SUPPRIMER
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
