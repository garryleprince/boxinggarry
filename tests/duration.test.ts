import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '@/domain/model/workout';
import {
  COMBINED_BUDGET_SEC,
  EXTENSION_BUDGET_SEC,
  MAIN_BUDGET_SEC,
  auditDuration,
  computeDuration,
} from '@/engines/training/duration';
import { generateWorkout } from '@/engines/training/generator';
import { chooseExtension, asSessionTemplate } from '@/engines/training/extensions';
import { TEMPLATES } from '@/engines/training/templates';
import { dateKey } from '@/domain/model/ids';
import { advanced, beginner, freshRecovery, profile, progressionFor, tiredRecovery } from './fixtures';

/**
 * Duration is the product's hardest promise: 20 minutes means 20 minutes.
 * These tests exercise the generator across profiles, dates and states.
 */

const PROFILES = [
  { name: 'débutant', p: beginner() },
  { name: 'intermédiaire', p: profile() },
  { name: 'avancé', p: advanced() },
  { name: 'espace réduit', p: profile({ space: 'tapis' }) },
  { name: 'objectif core', p: profile({ goals: ['core', 'mobilite'] }) },
  { name: 'objectif explosivité', p: profile({ goals: ['explosivite', 'jambes'] }) },
];

const DATES = Array.from({ length: 30 }, (_, i) => dateKey(new Date(2026, 8, 1 + i)));

describe('budget de durée', () => {
  it('chaque séance principale tient dans 20:00 pour tout profil et toute date', () => {
    for (const { name, p } of PROFILES) {
      for (const archetype of ARCHETYPES) {
        for (const date of DATES) {
          const w = generateWorkout({
            profile: p,
            progression: progressionFor(p),
            recovery: freshRecovery(),
            history: [],
            date,
            archetype,
          });
          const budget = TEMPLATES[archetype].budgetSec;
          expect(
            w.durationSec,
            `${name} / ${archetype} / ${date} = ${w.durationSec}s`,
          ).toBeLessThanOrEqual(budget);
          expect(budget).toBeLessThanOrEqual(MAIN_BUDGET_SEC);
        }
      }
    }
  });

  it('remplit au moins 96 % du budget : une séance de 20 min ne dure pas 12 min', () => {
    for (const { name, p } of PROFILES) {
      for (const archetype of ARCHETYPES) {
        const w = generateWorkout({
          profile: p,
          progression: progressionFor(p),
          recovery: freshRecovery(),
          history: [],
          date: DATES[0]!,
          archetype,
        });
        const budget = TEMPLATES[archetype].budgetSec;
        expect(w.durationSec, `${name} / ${archetype}`).toBeGreaterThanOrEqual(budget * 0.9);
      }
    }
  });

  it('tient le budget même avec un athlète très fatigué ou en reprise', () => {
    for (const { p } of PROFILES) {
      for (const archetype of ARCHETYPES) {
        const prog = { ...progressionFor(p), calibration: 0.55, rampSessions: 0 };
        const w = generateWorkout({
          profile: p,
          progression: prog,
          recovery: tiredRecovery(),
          history: [],
          date: DATES[3]!,
          archetype,
          adjust: -1,
        });
        expect(w.durationSec).toBeLessThanOrEqual(TEMPLATES[archetype].budgetSec);
      }
    }
  });

  it('tient le budget quand on demande « intensifier »', () => {
    for (const { p } of PROFILES) {
      for (const archetype of ARCHETYPES) {
        const w = generateWorkout({
          profile: p,
          progression: progressionFor(p),
          recovery: freshRecovery(),
          history: [],
          date: DATES[5]!,
          archetype,
          adjust: 1,
        });
        expect(w.durationSec).toBeLessThanOrEqual(TEMPLATES[archetype].budgetSec);
      }
    }
  });

  it('l’extension +10 ne dépasse jamais 10:00', () => {
    for (const { p } of PROFILES) {
      for (const archetype of ARCHETYPES) {
        const main = generateWorkout({
          profile: p,
          progression: progressionFor(p),
          recovery: freshRecovery(),
          history: [],
          date: DATES[7]!,
          archetype,
        });
        const choice = chooseExtension(archetype, main.intensity, freshRecovery());
        const ext = generateWorkout({
          profile: p,
          progression: progressionFor(p),
          recovery: freshRecovery(),
          history: [],
          date: DATES[7]!,
          archetype,
          kind: 'extension',
          template: asSessionTemplate(choice.template, archetype),
        });
        expect(ext.durationSec).toBeLessThanOrEqual(EXTENSION_BUDGET_SEC);
        expect(main.durationSec + ext.durationSec).toBeLessThanOrEqual(COMBINED_BUDGET_SEC);
      }
    }
  });

  it('l’audit détaillé retrouve exactement le total', () => {
    const p = profile();
    const w = generateWorkout({
      profile: p,
      progression: progressionFor(p),
      recovery: freshRecovery(),
      history: [],
      date: DATES[0]!,
      archetype: 'full-body-boxing',
    });
    const audit = auditDuration(w.blocks, MAIN_BUDGET_SEC);
    const sum = audit.blocks.reduce((s, b) => s + b.sec, 0) + audit.transitionsSec;
    expect(sum).toBe(audit.totalSec);
    expect(audit.totalSec).toBe(computeDuration(w.blocks));
    expect(audit.withinBudget).toBe(true);
  });
});
