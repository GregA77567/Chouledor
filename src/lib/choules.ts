export type Award = "or" | "argent" | "bronze" | "dommage";

export const AWARDS: {
  key: Award;
  label: string;
  short: string;
  description: string;
}[] = [
  { key: "or", label: "Choule d'Or", short: "OR", description: "L'homme du match" },
  { key: "argent", label: "Choule d'Argent", short: "ARG", description: "La belle deuxième" },
  { key: "bronze", label: "Choule de Bronze", short: "BR", description: "Sur le podium" },
  { key: "dommage", label: "Le Dommage", short: "D", description: "On en reparle demain" },
];

export type Player = {
  id: string;
  name: string;
  number: number;
  position: string;
  tagline: string;
};

export type Match = {
  id: string;
  opponent: string;
  our_score: number | null;
  their_score: number | null;
  played_on: string;
  note: string;
  is_open: boolean;
  is_revealed: boolean;
};

export type Vote = {
  id: string;
  match_id: string;
  voter_id: string;
  player_id: string;
  award: Award;
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .replace(".", "")
    .slice(0, 2)
    .toUpperCase();
}
