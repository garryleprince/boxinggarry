import { describe, expect, it } from 'vitest';
import { EXERCISES } from '@/data/exercises';
import {
  BONES,
  DRAWN,
  JOINT_ORDER,
  POSES,
  emphasisFor,
  samplePoseCycle,
  supportFor,
  type PoseKey,
} from '@/data/poses';
import { ANCHORS, BONE_LENGTH, GROUND, contactsOf, dist, trunkHeight, type Joint } from '@/data/skeleton';
import { PATTERN_CADENCE } from '@/domain/model/taxonomy';

/**
 * The exercise figures are the app's only demonstration of *how* to move, so
 * they are held to measurable standards rather than to a look. Every claim
 * here was a real defect in the first drawings: bones that changed length from
 * one exercise to the next, one arm longer than the other, push-ups hovering
 * above the floor, limbs that shrank mid-swing, and a visible snap back to the
 * start at the end of every repetition.
 */

const KEYS = Object.keys(POSES) as PoseKey[];
const SEQUENCES = EXERCISES.map((e) => e.poses);

/** Canonical length of each drawn bone. */
const EXPECTED: Record<string, number> = {
  'neck-hip': BONE_LENGTH.trunk,
  'neck-shoulderL': BONE_LENGTH.clavicle,
  'neck-shoulderR': BONE_LENGTH.clavicle,
  'shoulderL-elbowL': BONE_LENGTH.upperArm,
  'shoulderR-elbowR': BONE_LENGTH.upperArm,
  'elbowL-handL': BONE_LENGTH.foreArm,
  'elbowR-handR': BONE_LENGTH.foreArm,
  'hip-kneeL': BONE_LENGTH.thigh,
  'hip-kneeR': BONE_LENGTH.thigh,
  'kneeL-footL': BONE_LENGTH.shin,
  'kneeR-footR': BONE_LENGTH.shin,
};

describe('anatomie', () => {
  it('donne la même longueur à un os dans toutes les poses', () => {
    for (const key of KEYS) {
      for (const [a, b] of BONES) {
        expect(dist(POSES[key][a], POSES[key][b])).toBeCloseTo(EXPECTED[`${a}-${b}`]!, 6);
      }
    }
  });

  it('donne la même longueur au côté gauche et au côté droit', () => {
    const pairs: [Joint, Joint, Joint, Joint][] = [
      ['shoulderL', 'elbowL', 'shoulderR', 'elbowR'],
      ['elbowL', 'handL', 'elbowR', 'handR'],
      ['hip', 'kneeL', 'hip', 'kneeR'],
      ['kneeL', 'footL', 'kneeR', 'footR'],
    ];
    for (const key of KEYS) {
      for (const [a, b, c, d] of pairs) {
        expect(dist(POSES[key][a], POSES[key][b])).toBeCloseTo(dist(POSES[key][c], POSES[key][d]), 6);
      }
    }
  });

  it('respecte les proportions humaines usuelles', () => {
    // Jambe ≈ cuisse, avant-bras un peu plus court que le bras, tronc plus
    // court que la jambe entière : les rapports anatomiques de référence.
    expect(BONE_LENGTH.shin / BONE_LENGTH.thigh).toBeGreaterThan(0.95);
    expect(BONE_LENGTH.shin / BONE_LENGTH.thigh).toBeLessThan(1.05);
    expect(BONE_LENGTH.foreArm / BONE_LENGTH.upperArm).toBeGreaterThan(0.8);
    expect(BONE_LENGTH.foreArm / BONE_LENGTH.upperArm).toBeLessThan(0.95);
    expect(BONE_LENGTH.trunk).toBeLessThan(BONE_LENGTH.thigh + BONE_LENGTH.shin);
  });
});

describe('appui au sol', () => {
  it('pose au sol toute pose dessinée au sol', () => {
    for (const key of KEYS) {
      if ((ANCHORS[key] ?? { kind: 'ground' }).kind !== 'ground') continue;
      const lowest = Math.max(...JOINT_ORDER.map((j) => POSES[key][j][1]));
      expect(Math.abs(lowest - GROUND), key).toBeLessThan(2);
    }
  });

  it('pose au sol chaque appui du dessin, pas seulement le plus bas', () => {
    // Un gainage dont les mains flottent pendant que les pieds touchent est le
    // défaut le plus visible de l'ancienne bibliothèque.
    for (const key of KEYS) {
      if ((ANCHORS[key] ?? { kind: 'ground' }).kind !== 'ground') continue;
      for (const joint of contactsOf(DRAWN[key])) {
        expect(Math.abs(POSES[key][joint][1] - GROUND), `${key}.${joint}`).toBeLessThan(6);
      }
    }
  });

  it('laisse les sauts en l’air et la traction sous la barre', () => {
    for (const [key, anchor] of Object.entries(ANCHORS)) {
      const lowest = Math.max(...JOINT_ORDER.map((j) => POSES[key as PoseKey][j][1]));
      if (anchor.kind === 'air') expect(GROUND - lowest, key).toBeGreaterThan(3);
      if (anchor.kind === 'hands') {
        expect(Math.min(POSES[key as PoseKey].handL[1], POSES[key as PoseKey].handR[1])).toBeCloseTo(anchor.y, 6);
      }
    }
    // La barre ne bouge pas entre le bas et le haut d'une traction : c'est le
    // corps qui monte.
    expect(POSES.hang.handL[1]).toBeCloseTo(POSES.pullTop.handL[1], 6);
    const rise =
      Math.max(...JOINT_ORDER.map((j) => POSES.hang[j][1])) -
      Math.max(...JOINT_ORDER.map((j) => POSES.pullTop[j][1]));
    expect(rise).toBeGreaterThan(8);
  });
});

describe('cadrage', () => {
  /** Half the widest stroke, and the head circle. */
  const STROKE = 2.5;
  const HEAD = 6.6;

  it('garde chaque pose dans le cadre de dessin', () => {
    for (const key of KEYS) {
      const pose = POSES[key];
      const reach = (j: Joint) => (j === 'head' ? HEAD : STROKE);
      const left = Math.min(...JOINT_ORDER.map((j) => pose[j][0] - reach(j)));
      const right = Math.max(...JOINT_ORDER.map((j) => pose[j][0] + reach(j)));
      const top = Math.min(...JOINT_ORDER.map((j) => pose[j][1] - reach(j)));
      const bottom = Math.max(...JOINT_ORDER.map((j) => pose[j][1] + reach(j)));
      expect(left, key).toBeGreaterThan(-1);
      expect(right, key).toBeLessThan(101);
      expect(top, key).toBeGreaterThan(-1);
      expect(bottom, key).toBeLessThan(101);
    }
  });
});

describe('animation', () => {
  const SAMPLES = 160;

  it('boucle sans à-coup : la dernière image est la première', () => {
    for (const keys of SEQUENCES) {
      if (keys.length < 2) continue;
      const before = samplePoseCycle(keys, 0.999999);
      const after = samplePoseCycle(keys, 0);
      const jump = JOINT_ORDER.reduce((s, j) => s + dist(before[j], after[j]), 0);
      expect(jump, keys.join('→')).toBeLessThan(0.01);
    }
  });

  it('garde les os rigides pendant tout le mouvement', () => {
    for (const keys of SEQUENCES) {
      for (let i = 0; i < SAMPLES; i++) {
        const pose = samplePoseCycle(keys, i / SAMPLES);
        for (const [a, b] of BONES) {
          expect(dist(pose[a], pose[b]), `${keys.join('→')} ${a}-${b}`).toBeCloseTo(
            EXPECTED[`${a}-${b}`]!,
            6,
          );
        }
      }
    }
  });

  it('avance sans saut d’une image à la suivante', () => {
    // Un vrai saut ne rétrécit pas quand on échantillonne plus finement ; un
    // mouvement continu, si. À 2000 images par répétition, le plus grand pas
    // d'une articulation reste donc minuscule — sauf s'il reste une rupture.
    const FINE = 2000;
    for (const keys of SEQUENCES) {
      if (keys.length < 2) continue;
      let previous = samplePoseCycle(keys, 0);
      let biggest = 0;
      for (let i = 1; i <= FINE; i++) {
        const pose = samplePoseCycle(keys, i / FINE);
        biggest = Math.max(biggest, ...JOINT_ORDER.map((j) => dist(previous[j], pose[j])));
        previous = pose;
      }
      expect(biggest, keys.join('→')).toBeLessThan(1);
    }
  });

  it('bouge vraiment : aucune séquence n’est aplatie par la mise au sol', () => {
    // Un relevé de mollets dont le corps est replaqué au sol à chaque pose ne
    // montre plus rien du tout.
    for (const keys of SEQUENCES) {
      if (keys.length < 2) continue;
      let travel = 0;
      for (let i = 0; i < keys.length - 1; i++) {
        travel = Math.max(
          travel,
          ...JOINT_ORDER.map((j) => dist(POSES[keys[i]!][j], POSES[keys[i + 1]!][j])),
        );
      }
      expect(travel, keys.join('→')).toBeGreaterThan(3);
    }
  });

  it('marque un temps d’arrêt en fin de course', () => {
    // Sans pause, le mouvement se lit comme un tremblement plutôt que comme
    // des répétitions comptables.
    for (const keys of SEQUENCES) {
      if (keys.length < 2) continue;
      const still = Array.from({ length: SAMPLES }, (_, i) => i / SAMPLES).filter((p) => {
        const a = samplePoseCycle(keys, p);
        const b = samplePoseCycle(keys, p + 1 / SAMPLES);
        return JOINT_ORDER.every((j) => dist(a[j], b[j]) < 0.05);
      }).length;
      expect(still, keys.join('→')).toBeGreaterThan(SAMPLES * 0.08);
    }
  });

  it('descend moins vite qu’il ne remonte', () => {
    // Phase excentrique contrôlée, phase concentrique plus vive : le tempo
    // qu'un coach impose. On mesure le temps passé à descendre contre le temps
    // passé à remonter, pauses exclues.
    const halves = (keys: readonly PoseKey[]) => {
      const FINE = 600;
      const height = (p: number) => trunkHeight(samplePoseCycle(keys, p));
      let down = 0;
      let up = 0;
      for (let i = 0; i < FINE; i++) {
        const delta = height((i + 1) / FINE) - height(i / FINE);
        if (delta > 0.01) down++;
        else if (delta < -0.01) up++;
      }
      return { down, up };
    };
    for (const keys of [['pushTop', 'pushBottom'], ['stand', 'squatBottom']] as const) {
      const { down, up } = halves(keys);
      expect(down, `${keys.join('→')} descente`).toBeGreaterThan(up * 1.15);
    }
  });

  it('couvre chaque pose déclarée par un exercice', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.poses.length, exercise.id).toBeGreaterThan(0);
      for (const key of exercise.poses) expect(POSES[key], `${exercise.id}/${key}`).toBeTruthy();
    }
  });
});

describe('positions tenues', () => {
  const HELD = EXERCISES.filter((e) => e.poses.length === 1);

  it('fait respirer les isométries au lieu de les figer', () => {
    // Douze exercices tiennent une seule position. Une figure parfaitement
    // immobile se lit comme une image cassée, pas comme « tiens la position ».
    expect(HELD.length).toBeGreaterThan(8);
    for (const exercise of HELD) {
      const travel = Math.max(
        ...JOINT_ORDER.map((j) =>
          dist(samplePoseCycle(exercise.poses, 0)[j], samplePoseCycle(exercise.poses, 0.5)[j]),
        ),
      );
      expect(travel, exercise.name).toBeGreaterThan(1.5);
      expect(travel, exercise.name).toBeLessThan(4);
    }
  });

  it('garde les appuis au sol pendant qu’elles respirent', () => {
    // Un souffle soulève le corps, pas le sol.
    for (const exercise of HELD) {
      const key = exercise.poses[0]!;
      if ((ANCHORS[key] ?? { kind: 'ground' }).kind !== 'ground') continue;
      for (const phase of [0, 0.25, 0.5, 0.75]) {
        const pose = samplePoseCycle(exercise.poses, phase);
        for (const joint of contactsOf(DRAWN[key])) {
          expect(Math.abs(pose[joint][1] - GROUND), `${exercise.name} ${joint}`).toBeLessThan(7);
        }
      }
    }
  });
});

describe('appuis dessinés', () => {
  it('dessine le support des exercices qui reposent sur autre chose que le sol', () => {
    const suspendus = ['tractions', 'tractions-negatives', 'suspension-barre', 'rowing-australien', 'dips-chaise', 'pompes-inclinees', 'pompes-murales', 'pompes-pieds-sureleves', 'chaise-murale'];
    for (const id of suspendus) {
      const exercise = EXERCISES.find((e) => e.id === id);
      expect(exercise, id).toBeTruthy();
      expect(supportFor(exercise!.poses).length, id).toBeGreaterThan(0);
    }
  });

  it('ne dessine rien sous un exercice qui se fait au sol', () => {
    // Les pompes piquées partagent leurs poses avec la version pieds surélevés :
    // dessiner un banc sous la version au sol serait un mensonge.
    for (const id of ['pompes', 'pompes-pike', 'gainage-ventral', 'squat']) {
      const exercise = EXERCISES.find((e) => e.id === id);
      if (!exercise) continue;
      expect(supportFor(exercise.poses).length, id).toBe(0);
    }
  });
});

describe('membre moteur', () => {
  const at = (keys: readonly PoseKey[], phase: number) =>
    emphasisFor(keys, samplePoseCycle(keys, phase));

  it('met en avant le côté qui travaille sur les mouvements alternés', () => {
    const swings = (keys: readonly PoseKey[], side: 'arms' | 'legs') => {
      const values = Array.from({ length: 40 }, (_, i) => at(keys, i / 40)[side]);
      return { min: Math.min(...values), max: Math.max(...values) };
    };
    // Bras : la main qui frappe, puis l'autre. Jambes : le genou qui monte.
    expect(swings(['jab', 'cross'], 'arms').min).toBeLessThan(-0.5);
    expect(swings(['jab', 'cross'], 'arms').max).toBeGreaterThan(0.5);
    expect(swings(['plank', 'plankTapA', 'plank', 'plankTapB'], 'arms').min).toBeLessThan(-0.5);
    expect(swings(['kneeHighL', 'kneeHighR'], 'legs').min).toBeLessThan(-0.5);
    expect(swings(['kneeHighL', 'kneeHighR'], 'legs').max).toBeGreaterThan(0.5);
    expect(swings(['climberA', 'climberB'], 'legs').min).toBeLessThan(-0.5);
    expect(swings(['climberA', 'climberB'], 'legs').max).toBeGreaterThan(0.5);
  });

  it('ne bouge pas sur un mouvement symétrique', () => {
    // Un dessin très légèrement asymétrique ne doit pas faire dériver l'ombrage
    // d'un côté à l'autre pendant la répétition : ce serait pire que fixe.
    for (const keys of [['pushTop', 'pushBottom'], ['stand', 'squatBottom'], ['hingeTop', 'hingeBottom']] as const) {
      for (let i = 0; i < 40; i++) {
        const e = at(keys, i / 40);
        expect(e.arms, `${keys.join('→')} bras`).toBeCloseTo(0.5, 1);
        expect(e.legs, `${keys.join('→')} jambes`).toBeCloseTo(0.5, 1);
      }
    }
  });
});

describe('cadence', () => {
  it('donne à chaque famille de mouvement sa propre phrase', () => {
    const heldShare = (keys: readonly PoseKey[], cadence: Parameters<typeof samplePoseCycle>[2]) => {
      const N = 400;
      let still = 0;
      for (let i = 0; i < N; i++) {
        const a = samplePoseCycle(keys, i / N, cadence);
        const b = samplePoseCycle(keys, (i + 1) / N, cadence);
        if (JOINT_ORDER.every((j) => dist(a[j], b[j]) < 0.04)) still++;
      }
      return still / N;
    };
    const jump = ['squatBottom', 'jumpAir'] as const;
    // Un saut suspend en l'air ; une mobilité tient ses deux fins de course.
    expect(heldShare(jump, 'explosif')).toBeGreaterThan(heldShare(jump, 'standard'));
    expect(heldShare(['cat', 'cow'], 'souple')).toBeGreaterThan(heldShare(['cat', 'cow'], 'standard'));
  });

  it('attribue une cadence à chaque motif de mouvement', () => {
    for (const exercise of EXERCISES) {
      expect(PATTERN_CADENCE[exercise.pattern], exercise.id).toBeTruthy();
    }
  });
});
