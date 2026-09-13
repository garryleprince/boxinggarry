import type { PresetId, SessionId } from './ids';

/**
 * Standard boxing punch numbering (cahier des charges §32).
 * Numbers are orthodox-relative: "lead" is the front hand, "rear" the back one.
 */
export const PUNCHES = {
  1: { fr: 'Jab', en: 'One', long: 'Jab' },
  2: { fr: 'Cross', en: 'Two', long: 'Cross' },
  3: { fr: 'Crochet avant', en: 'Three', long: 'Lead hook' },
  4: { fr: 'Crochet arrière', en: 'Four', long: 'Rear hook' },
  5: { fr: 'Uppercut avant', en: 'Five', long: 'Lead uppercut' },
  6: { fr: 'Uppercut arrière', en: 'Six', long: 'Rear uppercut' },
} as const;

export type PunchNumber = keyof typeof PUNCHES;

/** Defensive or footwork actions that can appear inside a combination. */
export const MOVES = {
  slip: { fr: 'Esquive', en: 'Slip' },
  roll: { fr: 'Rouler', en: 'Roll' },
  step: { fr: 'Pas', en: 'Step' },
  pivot: { fr: 'Pivot', en: 'Pivot' },
} as const;

export type MoveKey = keyof typeof MOVES;

/** A combination token: a punch number, or a named movement. */
export type ComboToken = PunchNumber | MoveKey;

export interface Combination {
  readonly id: string;
  readonly tokens: readonly ComboToken[];
  /** 1 (fondamental) … 4 (avancé). */
  readonly level: 1 | 2 | 3 | 4;
  readonly note?: string;
}

/** Round/rest structure. `rounds` × (`workSec` + `restSec`), minus last rest. */
export interface TimerPreset {
  readonly id: PresetId;
  readonly name: string;
  readonly rounds: number;
  readonly workSec: number;
  readonly restSec: number;
  /** Optional lead-in before round 1. */
  readonly prepSec: number;
  readonly builtIn: boolean;
}

/** The brief for one shadowboxing round. */
export interface ShadowRound {
  readonly index: number;
  readonly title: string;
  readonly instruction: string;
  readonly combos: readonly Combination[];
  /** Seconds between called combinations. Lower = denser round. */
  readonly calloutIntervalSec: number;
}

export interface ShadowboxingSession {
  readonly id: SessionId;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly preset: TimerPreset;
  readonly rounds: readonly ShadowRound[];
  readonly roundsCompleted: number;
}

export type CalloutDensity = 'legere' | 'normale' | 'dense';

export const DENSITY_INTERVAL: Record<CalloutDensity, number> = {
  legere: 8,
  normale: 5,
  dense: 3,
};
