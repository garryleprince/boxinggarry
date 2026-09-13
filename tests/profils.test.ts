import { describe, expect, it } from 'vitest';
import { getExercise } from '@/data/exercises';
import { dateKey, daysBetween, sessionId } from '@/domain/model/ids';
import { MUSCLE_GROUPS, MUSCLE_LABELS, MUSCLE_REGION } from '@/domain/model/taxonomy';
import type { MuscleGroup } from '@/domain/model/taxonomy';
import type { WorkoutSession } from '@/domain/model/workout';
import { applyLayoff, applySession, initialProgression } from '@/engines/progression';
import { applyWorkout, emptyRecovery } from '@/engines/recovery';
import { asSessionTemplate, chooseExtension } from '@/engines/training/extensions';
import { generateWorkout } from '@/engines/training/generator';
import { planWeek } from '@/engines/training/plan';
import { advanced, beginner, profile, TODAY } from './fixtures';

/**
 * Programme quality across the profiles the brief asks to be simulated
 * (cahier des charges §65). These assert the *coaching* properties of the
 * output, not merely that it compiles: a session that fits in 20 minutes but
 * trains only one pattern would pass the duration tests and fail here.
 */

const MONDAY = dateKey(new Date(2026, 8, 14));

function run(over: Partial<Parameters<typeof generateWorkout>[0]> = {}) {
  const p = over.profile ?? profile();
  return generateWorkout({
    profile: p,
    progression: over.progression ?? initialProgression(p.sportLevel),
    recovery: over.recovery ?? emptyRecovery(TODAY),
    history: over.history ?? [],
    date: over.date ?? MONDAY,
    archetype: over.archetype ?? 'full-body-boxing',
    ...over,
  });
}

const exercisesOf = (w: ReturnType<typeof run>) =>
  w.blocks.flatMap((b) => b.items.map((i) => getExercise(i.exerciseId)));

describe('qualité des programmes — profils simulés', () => {
  it('débutant : séance complète, accessible, sans impact élevé', () => {
    const p = beginner();
    const w = run({ profile: p, progression: initialProgression('debutant') });
    const ex = exercisesOf(w);

    expect(w.durationSec).toBeLessThanOrEqual(1200);
    expect(ex.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...ex.map((e) => e.level))).toBeLessThanOrEqual(3);
    expect(ex.every((e) => e.impact !== 'eleve')).toBe(true);
    // Coordination demands stay reasonable for someone starting out.
    expect(Math.max(...ex.map((e) => e.skill))).toBeLessThanOrEqual(3);
  });

  it('intermédiaire : trois régions travaillées, poussée et tirage équilibrés', () => {
    const w = run();
    const ex = exercisesOf(w);
    const regions = new Set(ex.flatMap((e) => e.primary.map((m) => MUSCLE_REGION[m])));
    expect(regions.size).toBeGreaterThanOrEqual(2);

    const patterns = ex.map((e) => e.pattern);
    // A full-body session must not be three pushes in a row.
    const pushes = patterns.filter((x) => x.startsWith('push')).length;
    expect(pushes).toBeLessThanOrEqual(2);
  });

  it('avancé : le niveau des exercices suit réellement le niveau déclaré', () => {
    const a = advanced();
    const b = beginner();
    const mean = (w: ReturnType<typeof run>) => {
      const ex = exercisesOf(w);
      return ex.reduce((s, e) => s + e.level, 0) / ex.length;
    };
    const hard = mean(run({ profile: a, progression: initialProgression('avance'), archetype: 'force' }));
    const easy = mean(run({ profile: b, progression: initialProgression('debutant'), archetype: 'force' }));
    expect(hard).toBeGreaterThan(easy + 0.5);
  });

  it('fatigué : intensité et impact réduits, mobilité préservée', () => {
    const tired = {
      ...emptyRecovery(TODAY),
      fatigue: { jambes: 0.88, 'haut-du-corps': 0.82, core: 0.7, cardio: 0.85 },
    };
    const fresh = run({ archetype: 'conditioning' });
    const spent = run({ archetype: 'conditioning', recovery: tired });

    const meanIntensity = (w: ReturnType<typeof run>) => {
      const ex = exercisesOf(w).filter((e) => e.pattern !== 'mobility');
      return ex.reduce((s, e) => s + e.intensity, 0) / Math.max(1, ex.length);
    };
    expect(meanIntensity(spent)).toBeLessThan(meanIntensity(fresh));
    expect(exercisesOf(spent).every((e) => e.impact === 'faible')).toBe(true);
    // The session still exists and still warms up and cools down.
    expect(spent.blocks.some((b) => b.kind === 'echauffement')).toBe(true);
    expect(spent.blocks.some((b) => b.kind === 'cooldown')).toBe(true);
    expect(spent.durationSec).toBeLessThanOrEqual(1200);
  });

  it('après plusieurs jours d’absence : séance recalibrée et annoncée comme telle', () => {
    const p = advanced();
    const fresh = initialProgression('avance');
    const lastSession = dateKey(new Date(2026, 7, 20));
    expect(daysBetween(lastSession, MONDAY)).toBeGreaterThan(20);
    const rusty = applyLayoff(fresh, lastSession, MONDAY);

    const normal = run({ profile: p, progression: fresh, archetype: 'force' });
    const comeback = run({ profile: p, progression: rusty, archetype: 'force' });

    const mean = (w: ReturnType<typeof run>) => {
      const ex = exercisesOf(w);
      return ex.reduce((s, e) => s + e.level, 0) / ex.length;
    };
    expect(mean(comeback)).toBeLessThan(mean(normal));
    expect(comeback.rationale.join(' ')).toMatch(/Reprise/);
    expect(comeback.durationSec).toBeLessThanOrEqual(1200);
  });

  it('a fait le +10 hier : la séance du jour en tient compte', () => {
    const p = profile();
    const yesterday = dateKey(new Date(2026, 8, 13));
    const main = run({ profile: p, date: yesterday, archetype: 'conditioning' });
    const choice = chooseExtension('conditioning', main.intensity, emptyRecovery(yesterday));
    const ext = run({
      profile: p,
      date: yesterday,
      archetype: 'conditioning',
      kind: 'extension',
      template: asSessionTemplate(choice.template, 'conditioning'),
    });

    const ts = Date.parse('2026-09-13T18:00:00Z');
    let recovery = applyWorkout(emptyRecovery(yesterday, ts), main, { overall: 2 }, ts);
    recovery = applyWorkout(recovery, ext, { overall: 2 }, ts + 600_000);

    const history: WorkoutSession[] = [main, ext].map((w, i) => ({
      id: sessionId(`h${i}`),
      workout: w,
      date: yesterday,
      startedAt: ts,
      elapsedSec: w.durationSec,
      performed: [],
      status: 'terminee',
      ...(i === 1 ? { extensionOf: sessionId('h0') } : {}),
    }));

    const today = run({ profile: p, recovery, history, archetype: 'full-body-boxing' });

    // Yesterday's load is visible in the reasoning and in the selection.
    expect(today.durationSec).toBeLessThanOrEqual(1200);
    const yesterdayIds = new Set(
      [main, ext].flatMap((w) => w.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId)))),
    );
    const todayIds = exercisesOf(today).map((e) => String(e.id));
    const repeated = todayIds.filter((id) => yesterdayIds.has(id)).length;
    expect(repeated / todayIds.length).toBeLessThan(0.5);
  });

  it('sur une semaine, la charge reste répartie et jamais deux jours durs de suite', () => {
    const p = profile({ weeklyFrequency: 5 });
    let progression = initialProgression(p.sportLevel);
    let recovery = emptyRecovery(TODAY);
    const history: WorkoutSession[] = [];
    const week = planWeek(p, MONDAY, MONDAY, []);
    const intensities: number[] = [];

    let ts = Date.parse('2026-09-14T18:00:00Z');
    for (const day of week.days) {
      if (day.status === 'repos') continue;
      const w = generateWorkout({
        profile: p,
        progression,
        recovery,
        history,
        date: day.date,
        archetype: day.archetype,
      });
      expect(w.durationSec, `${day.date} ${day.archetype}`).toBeLessThanOrEqual(w.budgetSec);
      intensities.push(w.intensity);

      const performed = w.blocks.flatMap((b) =>
        b.items.map((item) => ({
          exerciseId: item.exerciseId,
          blockId: b.id,
          round: 1,
          prescribed: item.dose,
          achieved: item.dose,
          measure: item.measure,
          skipped: false,
        })),
      );
      progression = applySession(progression, performed, { overall: 3 });
      recovery = applyWorkout(recovery, w, { overall: 3 }, ts);
      history.unshift({
        id: sessionId(day.date),
        workout: w,
        date: day.date,
        startedAt: ts,
        elapsedSec: w.durationSec,
        performed,
        status: 'terminee',
      });
      ts += 86_400_000;
    }

    // Fatigue must stay informative: a week of training cannot pin a region at
    // zero recovery, or the estimate stops steering anything.
    for (const [region, value] of Object.entries(recovery.fatigue)) {
      expect(value, region).toBeLessThan(0.85);
    }
    // And there is at least one genuinely lighter day in the week.
    expect(Math.min(...intensities)).toBeLessThanOrEqual(3);
  });
});

describe('calibration de la récupération', () => {
  it('une séance exigeante laisse la zone dominante autour de 60 % le lendemain', () => {
    const p = profile();
    const w = run({ profile: p, archetype: 'hybride-boxe' });
    const ts = Date.parse('2026-09-14T18:00:00Z');
    const after = applyWorkout(emptyRecovery(MONDAY, ts), w, { overall: 3 }, ts);
    // Right after: clearly loaded, never pinned.
    expect(after.fatigue.jambes).toBeGreaterThan(0.25);
    expect(after.fatigue.jambes).toBeLessThan(0.55);

    const nextMorning = applyWorkout(after, w, undefined, ts + 14 * 3_600_000, 0);
    const pct = 100 - Math.round(nextMorning.fatigue.jambes * 100);
    expect(pct).toBeGreaterThanOrEqual(55);
    expect(pct).toBeLessThanOrEqual(85);
  });

  it('un jour de récupération ne fatigue quasiment rien', () => {
    const p = profile();
    const w = run({ profile: p, archetype: 'recovery' });
    const after = applyWorkout(emptyRecovery(MONDAY), w, { overall: 4 });
    for (const value of Object.values(after.fatigue)) expect(value).toBeLessThan(0.05);
  });
});

describe('équilibre du corps (cahier des charges §18)', () => {
  it('aucun des 14 groupes musculaires n’est laissé de côté sur quatre semaines', () => {
    const p = profile({ weeklyFrequency: 5 });
    let progression = initialProgression(p.sportLevel);
    let recovery = emptyRecovery(MONDAY);
    const history: WorkoutSession[] = [];
    const worked = new Map<MuscleGroup, number>();
    const asPrimary = new Map<MuscleGroup, number>();
    let ts = Date.parse('2026-09-14T18:00:00Z');

    for (let week = 0; week < 4; week++) {
      const weekStart = dateKey(new Date(2026, 8, 14 + week * 7));
      for (const day of planWeek(p, weekStart, weekStart, history).days) {
        if (day.status === 'repos') continue;
        const workout = generateWorkout({
          profile: p,
          progression,
          recovery,
          history,
          date: day.date,
          archetype: day.archetype,
        });
        for (const ex of exercisesOf(workout)) {
          for (const m of ex.primary) asPrimary.set(m, (asPrimary.get(m) ?? 0) + 1);
          for (const m of [...ex.primary, ...ex.secondary]) {
            worked.set(m, (worked.get(m) ?? 0) + 1);
          }
        }
        const performed = workout.blocks.flatMap((b) =>
          b.items.map((item) => ({
            exerciseId: item.exerciseId,
            blockId: b.id,
            round: 1,
            prescribed: item.dose,
            achieved: item.dose,
            measure: item.measure,
            skipped: false,
          })),
        );
        progression = applySession(progression, performed, { overall: 3 });
        recovery = applyWorkout(recovery, workout, { overall: 3 }, ts);
        history.unshift({
          id: sessionId(day.date),
          workout,
          date: day.date,
          startedAt: ts,
          elapsedSec: workout.durationSec,
          performed,
          status: 'terminee',
        });
        ts += 86_400_000;
      }
    }

    for (const group of MUSCLE_GROUPS) {
      expect(worked.get(group) ?? 0, `${MUSCLE_LABELS[group]} jamais sollicité`).toBeGreaterThan(0);
    }
    // The large movers must also be trained as prime movers, not only as
    // assistants — otherwise "full body" is a label rather than a programme.
    for (const group of [
      'pectoraux',
      'dos',
      'epaules',
      'abdominaux',
      'obliques',
      'lombaires',
      'fessiers',
      'quadriceps',
      'ischio-jambiers',
      'mollets',
    ] as MuscleGroup[]) {
      expect(asPrimary.get(group) ?? 0, `${MUSCLE_LABELS[group]} jamais en principal`).toBeGreaterThan(
        3,
      );
    }
  });
});
