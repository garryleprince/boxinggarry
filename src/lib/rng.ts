/**
 * Small deterministic PRNG (mulberry32).
 *
 * Session generation must be reproducible: opening the app twice on the same
 * day has to show the same workout. Every random choice in the engines goes
 * through a seeded generator rather than `Math.random`.
 */
export function createRng(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = ReturnType<typeof createRng>;

/** Stable 32-bit hash of a string, used to derive seeds from date keys. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick one item, each weighted by `weight`. Falls back to the first item. */
export function weightedPick<T>(items: readonly T[], weight: (t: T) => number, rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  const weights = items.map((t) => Math.max(0, weight(t)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
