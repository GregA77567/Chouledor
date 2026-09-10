import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type AdminSession = { unlocked?: boolean };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "choules-admin",
    maxAge: 60 * 60 * 24 * 7,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

async function requireAdmin() {
  const session = await useSession<AdminSession>(sessionConfig());
  if (!session.data.unlocked) throw new Error("Unauthorized");
  return session;
}

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const expected = process.env["ADMIN_PASSWORD"];
    if (!expected) throw new Error("ADMIN_PASSWORD is not set");
    if (!passwordMatches(data.password ?? "", expected)) return { ok: false as const };
    const session = await useSession<AdminSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const adminStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  return { unlocked: Boolean(session.data.unlocked) };
});

export const adminOverview = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [playersRes, matchesRes] = await Promise.all([
    supabaseAdmin.from("players").select("*").order("name"),
    supabaseAdmin.from("matches").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (matchesRes.error) throw matchesRes.error;

  const current = matchesRes.data?.[0] ?? null;
  let voterIds: string[] = [];
  let votes: { voter_id: string; player_id: string; award: string }[] = [];
  if (current) {
    const [votersRes, votesRes] = await Promise.all([
      supabaseAdmin.from("match_voters").select("player_id").eq("match_id", current.id),
      supabaseAdmin.from("votes").select("voter_id, player_id, award").eq("match_id", current.id),
    ]);
    if (votersRes.error) throw votersRes.error;
    if (votesRes.error) throw votesRes.error;
    voterIds = (votersRes.data ?? []).map((r) => r.player_id);
    votes = votesRes.data ?? [];
  }

  return { players: playersRes.data ?? [], matches: matchesRes.data ?? [], current, voterIds, votes };
});

export const createMatch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      opponent: string;
      our_score: number | null;
      their_score: number | null;
      played_on: string;
      note: string;
      voterIds: string[];
    }) => {
      if (!data.opponent?.trim()) throw new Error("Adversaire requis");
      return data;
    },
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Un seul match ouvert à la fois
    const { error: closeError } = await supabaseAdmin
      .from("matches")
      .update({ is_open: false })
      .eq("is_open", true);
    if (closeError) throw closeError;

    const { data: match, error } = await supabaseAdmin
      .from("matches")
      .insert({
        opponent: data.opponent.trim(),
        our_score: data.our_score,
        their_score: data.their_score,
        played_on: data.played_on,
        note: data.note ?? "",
        is_open: true,
        is_revealed: false,
      })
      .select()
      .single();
    if (error) throw error;

    if (data.voterIds.length) {
      const { error: vErr } = await supabaseAdmin
        .from("match_voters")
        .insert(data.voterIds.map((player_id) => ({ match_id: match.id, player_id })));
      if (vErr) throw vErr;
    }
    return { id: match.id };
  });

export const updateMatch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      matchId: string;
      opponent: string;
      our_score: number | null;
      their_score: number | null;
      played_on: string;
      note: string;
    }) => {
      if (!data.opponent?.trim()) throw new Error("Adversaire requis");
      return data;
    },
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("matches")
      .update({
        opponent: data.opponent.trim(),
        our_score: data.our_score,
        their_score: data.their_score,
        played_on: data.played_on,
        note: data.note ?? "",
      })
      .eq("id", data.matchId);
    if (error) throw error;
    return { ok: true as const };
  });

export const setMatchVoters = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string; voterIds: string[] }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin
      .from("match_voters")
      .delete()
      .eq("match_id", data.matchId);
    if (delErr) throw delErr;
    if (data.voterIds.length) {
      const { error } = await supabaseAdmin
        .from("match_voters")
        .insert(data.voterIds.map((player_id) => ({ match_id: data.matchId, player_id })));
      if (error) throw error;
    }
    return { ok: true as const };
  });

export const setMatchState = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string; is_open: boolean; is_revealed: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("matches")
      .update({ is_open: data.is_open, is_revealed: data.is_revealed })
      .eq("id", data.matchId);
    if (error) throw error;
    return { ok: true as const };
  });

export const addPlayer = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; position: string }) => {
    if (!data.name?.trim()) throw new Error("Nom requis");
    return data;
  })
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("players").insert({
      name: data.name.trim(),
      number: 0,
      position: data.position || "Joueur",
    });
    if (error) throw error;
    return { ok: true as const };
  });

export const removePlayer = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("players").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
