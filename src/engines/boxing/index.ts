import { COMBOS, comboNotation, comboSpeech, combosUpToLevel } from '@/data/combos';
import { BUILT_IN_PRESETS } from '@/data/presets';
import type {
  CalloutDensity,
  Combination,
  ShadowRound,
  TimerPreset,
} from '@/domain/model/boxing';
import { DENSITY_INTERVAL } from '@/domain/model/boxing';
import type { BoxingLevel } from '@/domain/model/user';
import { createRng, hashString, type Rng } from '@/lib/rng';

/**
 * Boxing engine: round structures, shadowboxing briefs and combination
 * callouts. Combinations use the standard numbering (cahier des charges §32).
 */

/** Difficulty ceiling for combinations, from the athlete's boxing background. */
const LEVEL_CEILING: Record<BoxingLevel, 1 | 2 | 3 | 4> = {
  aucun: 2,
  loisir: 3,
  competiteur: 4,
};

export interface ShadowPlanInput {
  readonly boxingLevel: BoxingLevel;
  readonly rounds: number;
  readonly density: CalloutDensity;
  /** Stable seed so a given day's plan is reproducible. */
  readonly seed?: string;
}

/**
 * Progressive shadowboxing plan: one fundamental per round, building from the
 * jab to free work, in the order a coach would actually run a session.
 */
const ROUND_THEMES: readonly {
  title: string;
  instruction: string;
  /** Which combination ids to draw from; empty means "anything at level". */
  prefer: readonly string[];
}[] = [
  {
    title: 'Jab',
    instruction:
      'Round de mise en route. Jab seul, retour de garde systématique, un pas avant, un pas arrière.',
    prefer: ['1', '1-1'],
  },
  {
    title: 'Un-deux',
    instruction: 'Le duo fondamental. Pivote le pied arrière sur le cross, respire sur chaque coup.',
    prefer: ['1-2', '1-1-2'],
  },
  {
    title: 'Un-deux et déplacement',
    instruction:
      'Après chaque combinaison, sors de l’axe : un pas latéral ou un pivot. Ne reste jamais planté.',
    prefer: ['1-2', 'step-1-2', '1-2-1'],
  },
  {
    title: 'Combinaisons',
    instruction: 'Enchaînements à trois et quatre coups. Garde le rythme, la garde reste haute.',
    prefer: ['1-2-3', '1-2-3-2', '2-3-2', '1-6'],
  },
  {
    title: 'Esquives et ripostes',
    instruction: 'Frappe, esquive, riposte. L’esquive vient des jambes, pas du cou.',
    prefer: ['1-slip-2', '1-2-slip-2', '1-2-roll-3'],
  },
  {
    title: 'Libre',
    instruction:
      'Round libre. Tu choisis, tu varies les rythmes, tu finis sur une rafale les trente dernières secondes.',
    prefer: [],
  },
];

export function buildShadowPlan(input: ShadowPlanInput): ShadowRound[] {
  const ceiling = LEVEL_CEILING[input.boxingLevel];
  const pool = combosUpToLevel(ceiling);
  const interval = DENSITY_INTERVAL[input.density];

  const rounds: ShadowRound[] = [];
  for (let i = 0; i < input.rounds; i++) {
    // Walk the themes in order; with more rounds than themes, the later rounds
    // repeat the harder end rather than starting over at the jab.
    const theme =
      ROUND_THEMES[Math.min(i, ROUND_THEMES.length - 1)] ??
      ROUND_THEMES[ROUND_THEMES.length - 1]!;

    const preferred = theme.prefer
      .map((id) => pool.find((c) => c.id === id))
      .filter((c): c is Combination => c != null);

    const combos =
      preferred.length > 0
        ? preferred
        : pool.filter((c) => c.level >= Math.max(1, ceiling - 1)).slice(0, 6);

    rounds.push({
      index: i + 1,
      title: theme.title,
      instruction: theme.instruction,
      combos: combos.length > 0 ? combos : pool.slice(0, 3),
      calloutIntervalSec: interval,
    });
  }
  return rounds;
}

/** One scheduled callout inside a round. */
export interface Callout {
  readonly atSec: number;
  readonly combo: Combination;
  readonly notation: string;
  readonly speech: string;
}

/**
 * Schedule the combinations to call during a round.
 * Callouts are spread at the density interval with a little jitter, so the
 * athlete cannot anticipate the rhythm — which is the point of called work.
 */
export function scheduleCallouts(
  round: ShadowRound,
  roundSec: number,
  lang: 'fr' | 'en',
  seed = 0,
): Callout[] {
  if (round.combos.length === 0) return [];
  const rng: Rng = createRng(hashString(`${round.index}|${roundSec}|${seed}`));
  const out: Callout[] = [];
  const interval = Math.max(2, round.calloutIntervalSec);

  let t = 2;
  let i = 0;
  while (t < roundSec - 1) {
    const combo = round.combos[i % round.combos.length]!;
    out.push({
      atSec: Math.round(t),
      combo,
      notation: comboNotation(combo),
      speech: comboSpeech(combo, lang),
    });
    // ±25 % jitter keeps the pace unpredictable without bunching the calls.
    t += interval * (0.75 + rng() * 0.5);
    i += 1;
  }
  return out;
}

/** Presets, built-in plus any the athlete saved. */
export const allPresets = (custom: readonly TimerPreset[] = []): TimerPreset[] => [
  ...BUILT_IN_PRESETS,
  ...custom,
];

export function makeCustomPreset(
  name: string,
  rounds: number,
  workSec: number,
  restSec: number,
  prepSec = 10,
): TimerPreset {
  return {
    id: `custom-${Date.now()}` as TimerPreset['id'],
    name: name.trim() || 'Personnalisé',
    rounds: Math.max(1, Math.min(20, Math.round(rounds))),
    workSec: Math.max(5, Math.min(600, Math.round(workSec))),
    restSec: Math.max(0, Math.min(300, Math.round(restSec))),
    prepSec: Math.max(0, Math.min(60, Math.round(prepSec))),
    builtIn: false,
  };
}

export { COMBOS, comboNotation, comboSpeech, combosUpToLevel };
