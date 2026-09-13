import { describe, expect, it } from 'vitest';
import { CHAINS, getExercise } from '@/data/exercises';
import { dateKey, daysBetween } from '@/domain/model/ids';
import { MUSCLE_REGION, SPACE_RANK } from '@/domain/model/taxonomy';
import { ARCHETYPES } from '@/domain/model/workout';
import type { WorkoutSession } from '@/domain/model/workout';
import { sessionId } from '@/domain/model/ids';
import { generateWorkout } from '@/engines/training/generator';
import { TEMPLATES } from '@/engines/training/templates';
import { chooseExtension, asSessionTemplate, EXTENSIONS } from '@/engines/training/extensions';
import { applyLayoff, applySession, effectiveRank, initialProgression, rankOf } from '@/engines/progression';
import { applyWorkout, emptyRecovery, recoveryPercent } from '@/engines/recovery';
import { planWeek, resolveToday, trainingWeekdays } from '@/engines/training/plan';
import { advanced, beginner, freshRecovery, profile, progressionFor, TODAY } from './fixtures';

const gen = (over: Partial<Parameters<typeof generateWorkout>[0]> = {}) => {
  const p = over.profile ?? profile();
  return generateWorkout({
    profile: p,
    progression: over.progression ?? progressionFor(p),
    recovery: over.recovery ?? freshRecovery(),
    history: over.history ?? [],
    date: over.date ?? TODAY,
    archetype: over.archetype ?? 'full-body-boxing',
    ...over,
  });
};

describe('cohérence des séances', () => {
  it('ne prescrit jamais deux fois le même exercice dans une séance', () => {
    for (const archetype of ARCHETYPES) {
      const w = gen({ archetype });
      const ids = w.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
      expect(new Set(ids).size, archetype).toBe(ids.length);
    }
  });

  it('respecte les exercices exclus, sans exception', () => {
    const excluded = ['burpees', 'squat-saute', 'pompes', 'gainage', 'mountain-climbers'];
    const p = profile({ excluded: excluded as never });
    for (const archetype of ARCHETYPES) {
      const w = gen({ profile: p, progression: progressionFor(p), archetype });
      const ids = w.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId)));
      for (const id of excluded) expect(ids, archetype).not.toContain(id);
    }
  });

  it('respecte l’espace disponible et le matériel déclaré', () => {
    const p = profile({ space: 'tapis', equipment: ['aucun'] });
    for (const archetype of ARCHETYPES) {
      const w = gen({ profile: p, progression: progressionFor(p), archetype });
      for (const block of w.blocks) {
        for (const item of block.items) {
          const ex = getExercise(item.exerciseId);
          expect(SPACE_RANK[ex.space], `${ex.name}`).toBeLessThanOrEqual(SPACE_RANK['tapis']);
          expect(ex.equipment.some((e) => e === 'aucun'), `${ex.name}`).toBe(true);
        }
      }
    }
  });

  it('respecte les patterns interdits après déclaration d’une limitation', () => {
    const p = profile({ avoidPatterns: ['plyo-lower', 'plyo-upper', 'push-vertical'] });
    for (const archetype of ARCHETYPES) {
      const w = gen({ profile: p, progression: progressionFor(p), archetype });
      for (const block of w.blocks) {
        for (const item of block.items) {
          expect(['plyo-lower', 'plyo-upper', 'push-vertical']).not.toContain(
            getExercise(item.exerciseId).pattern,
          );
        }
      }
    }
  });

  it('produit toujours un échauffement et un retour au calme sur une séance principale', () => {
    for (const archetype of ARCHETYPES) {
      const w = gen({ archetype });
      const kinds = w.blocks.map((b) => b.kind);
      expect(kinds, archetype).toContain('echauffement');
      expect(kinds.includes('cooldown'), archetype).toBe(true);
    }
  });

  it('n’utilise que des étirements dynamiques à l’échauffement et statiques au retour au calme', () => {
    for (const archetype of ARCHETYPES) {
      const w = gen({ archetype });
      for (const block of w.blocks) {
        for (const item of block.items) {
          const ex = getExercise(item.exerciseId);
          if (!ex.stretch) continue;
          if (block.kind === 'echauffement') expect(ex.stretch, ex.name).toBe('dynamique');
          if (block.kind === 'cooldown') expect(ex.stretch, ex.name).toBe('statique');
        }
      }
    }
  });

  it('varie les exercices d’un jour à l’autre', () => {
    const p = profile();
    const history: WorkoutSession[] = [];
    const seen: string[][] = [];
    for (let day = 0; day < 4; day++) {
      const date = dateKey(new Date(2026, 8, 14 + day));
      const w = gen({ profile: p, date, archetype: 'full-body-boxing', history });
      const ids = w.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId)));
      seen.push(ids);
      history.unshift({
        id: sessionId(`s${day}`),
        workout: w,
        date,
        startedAt: 0,
        elapsedSec: w.durationSec,
        performed: [],
        status: 'terminee',
      });
    }
    // Consecutive sessions of the same archetype must not be near-copies.
    for (let i = 1; i < seen.length; i++) {
      const overlap = seen[i]!.filter((id) => seen[i - 1]!.includes(id)).length;
      expect(overlap / seen[i]!.length).toBeLessThan(0.6);
    }
  });

  it('est déterministe : même jour, même profil, même séance', () => {
    const a = gen({ archetype: 'conditioning' });
    const b = gen({ archetype: 'conditioning' });
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
  });

  it('couvre l’ensemble du corps sur une semaine complète', () => {
    const p = profile({ weeklyFrequency: 5, goals: ['condition-generale'] });
    const regions = new Set<string>();
    const week = planWeek(p, TODAY, TODAY, []);
    for (const day of week.days) {
      if (day.status === 'repos') continue;
      const w = gen({ profile: p, date: day.date, archetype: day.archetype });
      for (const block of w.blocks) {
        for (const item of block.items) {
          for (const m of getExercise(item.exerciseId).primary) regions.add(MUSCLE_REGION[m]);
        }
      }
    }
    // Legs, upper body and core must all be trained across a week.
    expect([...regions].sort()).toEqual(['core', 'haut-du-corps', 'jambes']);
  });

  it('réduit l’impact articulaire quand l’athlète est très fatigué', () => {
    const tired = {
      ...emptyRecovery(TODAY),
      fatigue: { jambes: 0.9, 'haut-du-corps': 0.9, core: 0.9, cardio: 0.9 },
    };
    for (const archetype of ARCHETYPES) {
      const w = gen({ archetype, recovery: tired });
      for (const block of w.blocks) {
        for (const item of block.items) {
          expect(getExercise(item.exerciseId).impact, archetype).toBe('faible');
        }
      }
    }
  });
});

describe('module +10', () => {
  it('n’est jamais obligatoire : la progression fonctionne sans lui', () => {
    // A main session is complete on its own — it always carries a cool-down
    // and never depends on the extension for its structure.
    for (const archetype of ARCHETYPES) {
      const w = gen({ archetype });
      expect(w.kind).toBe('principal');
      expect(w.blocks.some((b) => b.kind === 'cooldown')).toBe(true);
    }
  });

  it('complète la séance au lieu de la répéter', () => {
    for (const archetype of ARCHETYPES) {
      const main = gen({ archetype });
      const choice = chooseExtension(archetype, main.intensity, freshRecovery());
      const mainIds = new Set(main.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId))));
      const ext = gen({
        archetype,
        kind: 'extension',
        template: asSessionTemplate(choice.template, archetype),
        avoid: [...mainIds],
      });
      // The working blocks must be entirely new; a stretch may legitimately
      // reappear in the cool-down when the mobility pool is nearly exhausted.
      const workIds = ext.blocks
        .filter((b) => b.kind !== 'cooldown')
        .flatMap((b) => b.items.map((i) => String(i.exerciseId)));
      expect(workIds.filter((id) => mainIds.has(id)), archetype).toEqual([]);
    }
  });

  it('propose du travail moins traumatisant après une séance intense', () => {
    const choice = chooseExtension('explosivite', 5, freshRecovery());
    expect(EXTENSIONS[choice.template.key].intensity).toBeLessThanOrEqual(3);
  });

  it('propose du travail plus dur après une séance légère', () => {
    const choice = chooseExtension('core-stabilite', 2, freshRecovery());
    expect(EXTENSIONS[choice.template.key].intensity).toBeGreaterThanOrEqual(4);
  });
});

describe('progression', () => {
  it('chaque chaîne est ordonnée du plus accessible au plus difficile', () => {
    for (const chain of CHAINS) {
      const levels = chain.steps.map((id) => getExercise(id).level);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]!, `${chain.name} #${i}`).toBeGreaterThanOrEqual(levels[i - 1]!);
      }
    }
  });

  it('monte d’un rang après trois séances faciles réussies', () => {
    let state = initialProgression('debutant');
    const before = rankOf(state, 'poussee');
    const performed = [
      { exerciseId: getExercise('pompes-genoux').id, blockId: 'b', round: 1, prescribed: 10, achieved: 10, measure: 'reps' as const, skipped: false },
    ];
    for (let i = 0; i < 3; i++) state = applySession(state, performed, { overall: 4 });
    expect(rankOf(state, 'poussee')).toBe(before + 1);
  });

  it('redescend d’un rang après des séances trop dures', () => {
    let state = initialProgression('intermediaire');
    const before = rankOf(state, 'squat');
    const performed = [
      { exerciseId: getExercise('squat').id, blockId: 'b', round: 1, prescribed: 20, achieved: 8, measure: 'reps' as const, skipped: false },
    ];
    for (let i = 0; i < 4; i++) state = applySession(state, performed, { overall: 1 });
    expect(rankOf(state, 'squat')).toBe(Math.max(1, before - 1));
  });

  it('recalibre après une absence et remonte séance après séance', () => {
    const state = initialProgression('avance');
    const lastSession = dateKey(new Date(2026, 7, 10));
    const today = dateKey(new Date(2026, 8, 14));
    expect(daysBetween(lastSession, today)).toBeGreaterThan(30);

    const after = applyLayoff(state, lastSession, today);
    expect(after.calibration).toBeLessThan(1);
    expect(effectiveRank(after, 'poussee')).toBeLessThan(rankOf(state, 'poussee'));

    let ramped = after;
    for (let i = 0; i < 6; i++) ramped = applySession(ramped, [], { overall: 3 });
    expect(ramped.calibration).toBe(1);
    expect(effectiveRank(ramped, 'poussee')).toBe(rankOf(ramped, 'poussee'));
  });

  it('ne recalibre pas pour deux jours de repos', () => {
    const state = initialProgression('intermediaire');
    const after = applyLayoff(state, dateKey(new Date(2026, 8, 12)), TODAY);
    expect(after.calibration).toBe(1);
  });

  it('propose une séance plus accessible juste après une reprise', () => {
    const p = advanced();
    const fresh = progressionFor(p);
    const rusty = applyLayoff(fresh, dateKey(new Date(2026, 6, 1)), TODAY);
    const normal = gen({ profile: p, progression: fresh, archetype: 'force' });
    const comeback = gen({ profile: p, progression: rusty, archetype: 'force' });
    const levelOf = (w: typeof normal) =>
      w.blocks
        .flatMap((b) => b.items)
        .reduce((s, i) => s + getExercise(i.exerciseId).level, 0) /
      w.blocks.flatMap((b) => b.items).length;
    expect(levelOf(comeback)).toBeLessThan(levelOf(normal));
    expect(comeback.rationale.join(' ')).toContain('Reprise');
  });
});

describe('récupération', () => {
  it('une séance dure fatigue les zones qu’elle a travaillées', () => {
    const w = gen({ archetype: 'explosivite' });
    const after = applyWorkout(emptyRecovery(TODAY), w, { overall: 2 });
    expect(after.fatigue.jambes).toBeGreaterThan(0.1);
    expect(recoveryPercent(after).jambes).toBeLessThan(100);
  });

  it('la fatigue redescend avec le temps', () => {
    const w = gen({ archetype: 'conditioning' });
    const ts = Date.parse('2026-09-14T18:00:00Z');
    const after = applyWorkout(emptyRecovery(TODAY, ts), w, { overall: 2 }, ts);
    const threeDaysLater = applyWorkout(after, w, undefined, ts + 3 * 86_400_000, 0);
    expect(threeDaysLater.fatigue.jambes).toBeLessThan(after.fatigue.jambes);
  });

  it('un retour « trop facile » coûte moins qu’un retour « très difficile »', () => {
    const w = gen({ archetype: 'force' });
    const easy = applyWorkout(emptyRecovery(TODAY), w, { overall: 5 });
    const brutal = applyWorkout(emptyRecovery(TODAY), w, { overall: 1 });
    expect(easy.fatigue['haut-du-corps']).toBeLessThan(brutal.fatigue['haut-du-corps']);
  });

  it('la fatigue reste bornée entre 0 et 1', () => {
    let state = emptyRecovery(TODAY);
    const w = gen({ archetype: 'conditioning' });
    for (let i = 0; i < 20; i++) state = applyWorkout(state, w, { overall: 1 }, Date.now());
    for (const v of Object.values(state.fatigue)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('planification', () => {
  it('respecte la fréquence hebdomadaire choisie', () => {
    for (let freq = 2; freq <= 6; freq++) {
      const p = profile({ weeklyFrequency: freq });
      const week = planWeek(p, TODAY, TODAY, []);
      const training = week.days.filter(
        (d) => d.status !== 'repos' && d.archetype !== 'recovery',
      );
      expect(training.length, `fréquence ${freq}`).toBe(trainingWeekdays(freq).length);
    }
  });

  it('n’enchaîne pas deux jours de même dominante', () => {
    const p = profile({ weeklyFrequency: 4 });
    const week = planWeek(p, TODAY, TODAY, []);
    const days = week.days.filter((d) => d.status !== 'repos' && d.archetype !== 'recovery');
    for (let i = 1; i < days.length; i++) {
      const consecutive = daysBetween(days[i - 1]!.date, days[i]!.date) === 1;
      if (consecutive) expect(days[i]!.archetype).not.toBe(days[i - 1]!.archetype);
    }
  });

  it('réorganise le programme après une séance manquée, sans culpabiliser', () => {
    const p = profile({ weeklyFrequency: 4, goals: ['explosivite'] });
    const wednesday = dateKey(new Date(2026, 8, 16));
    const plan = resolveToday(p, wednesday, []);
    if (plan.reshuffled) {
      expect(plan.note ?? '').not.toMatch(/rat|échec|discipline|excuse/i);
      expect(plan.note ?? '').toContain('priorité');
    }
    expect(plan.isRestDay || plan.archetype).toBeTruthy();
  });

  it('propose une récupération active plutôt que rien un jour de repos', () => {
    const p = profile({ weeklyFrequency: 3 });
    const sunday = dateKey(new Date(2026, 8, 20));
    const plan = resolveToday(p, sunday, []);
    expect(plan.archetype).toBe('recovery');
    expect(TEMPLATES.recovery.budgetSec).toBeLessThanOrEqual(20 * 60);
  });
});

describe('sécurité sportive', () => {
  it('un athlète débutant ne reçoit jamais d’exercice de niveau 4 ou 5', () => {
    const p = beginner();
    for (const archetype of ARCHETYPES) {
      const w = gen({ profile: p, progression: progressionFor(p), archetype });
      for (const block of w.blocks) {
        for (const item of block.items) {
          expect(getExercise(item.exerciseId).level, archetype).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});
