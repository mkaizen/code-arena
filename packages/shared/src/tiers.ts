/** The meaningful accent system — rating tiers map to a color. Mirrors the prototype. */
export interface Tier {
  name: string;
  /** CSS custom-property reference used by the web app. */
  color: string;
  min: number;
}

export const TIERS: Tier[] = [
  { name: "Newbie",        color: "var(--t-newbie)", min: 0 },
  { name: "Pupil",         color: "var(--t-pupil)",  min: 1200 },
  { name: "Specialist",    color: "var(--t-spec)",   min: 1400 },
  { name: "Expert",        color: "var(--t-expert)", min: 1600 },
  { name: "Cand. Master",  color: "var(--t-cm)",     min: 1900 },
  { name: "Master",        color: "var(--t-master)", min: 2100 },
  { name: "Grandmaster",   color: "var(--t-gm)",     min: 2400 },
];

export function tierOf(rating: number): Tier {
  let chosen = TIERS[0];
  for (const t of TIERS) if (rating >= t.min) chosen = t;
  return chosen;
}
