import type { Combination, ComboToken, MoveKey, PunchNumber } from '@/domain/model/boxing';
import { MOVES, PUNCHES } from '@/domain/model/boxing';

/**
 * Combination library, written in the standard numbering (§32).
 * Ordered roughly by difficulty so a round can be built at a chosen level.
 */
export const COMBOS: readonly Combination[] = [
  { id: '1', tokens: [1], level: 1, note: 'Le coup le plus utilisé de la boxe.' },
  { id: '1-1', tokens: [1, 1], level: 1, note: 'Double jab pour installer la distance.' },
  { id: '1-2', tokens: [1, 2], level: 1, note: 'La combinaison fondamentale.' },
  { id: '2', tokens: [2], level: 1 },
  { id: '1-1-2', tokens: [1, 1, 2], level: 2 },
  { id: '1-2-3', tokens: [1, 2, 3], level: 2 },
  { id: '1-2-1', tokens: [1, 2, 1], level: 2 },
  { id: '3-2', tokens: [3, 2], level: 2 },
  { id: '1-6', tokens: [1, 6], level: 2 },
  { id: '1-2-3-2', tokens: [1, 2, 3, 2], level: 3 },
  { id: '1-2-5-2', tokens: [1, 2, 5, 2], level: 3 },
  { id: '2-3-2', tokens: [2, 3, 2], level: 3 },
  { id: '1-slip-2', tokens: [1, 'slip', 2], level: 3, note: 'Esquive puis riposte.' },
  { id: '1-2-slip-2', tokens: [1, 2, 'slip', 2], level: 3 },
  { id: '1-2-roll-3', tokens: [1, 2, 'roll', 3], level: 4 },
  { id: '1-2-3-4', tokens: [1, 2, 3, 4], level: 4 },
  { id: '1-6-3-2', tokens: [1, 6, 3, 2], level: 4 },
  { id: '1-2-pivot-1', tokens: [1, 2, 'pivot', 1], level: 4, note: 'Sortir d’angle après la frappe.' },
  { id: '5-2-3-2', tokens: [5, 2, 3, 2], level: 4 },
  { id: 'step-1-2', tokens: ['step', 1, 2], level: 2, note: 'Entrer dans la distance.' },
];

const isPunch = (t: ComboToken): t is PunchNumber => typeof t === 'number';

/** Human-readable name of a token, in the chosen voice language. */
export function tokenLabel(token: ComboToken, lang: 'fr' | 'en'): string {
  if (isPunch(token)) return lang === 'fr' ? PUNCHES[token].fr : PUNCHES[token].en;
  return lang === 'fr' ? MOVES[token as MoveKey].fr : MOVES[token as MoveKey].en;
}

/** What the voice says for a combination, e.g. "Jab — Cross — Crochet avant". */
export const comboSpeech = (combo: Combination, lang: 'fr' | 'en'): string =>
  combo.tokens.map((t) => tokenLabel(t, lang)).join(' — ');

/** What the screen shows, e.g. "1 — 2 — slip — 2". */
export const comboNotation = (combo: Combination): string =>
  combo.tokens.map((t) => (isPunch(t) ? String(t) : t)).join(' — ');

/** Combinations at or below a difficulty level. */
export const combosUpToLevel = (level: number): Combination[] =>
  COMBOS.filter((c) => c.level <= level);
