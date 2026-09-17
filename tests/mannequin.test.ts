import { describe, expect, it } from 'vitest';
import { EXERCISES } from '@/data/exercises';
import { GROUND, POSES, samplePoseCycle, type PoseKey } from '@/data/poses';
import { ball, footOf, headEgg, pieces, taper } from '@/ui/mannequin';

/**
 * The mannequin is geometry, and geometry fails quietly: a degenerate limb
 * yields a path full of NaN, which SVG drops without a word, and a piece
 * vanishes mid-movement. So the shapes are checked for every pose in the
 * library and at every point of every animation, not spot-checked.
 */

const KEYS = Object.keys(POSES) as PoseKey[];
const numbers = (d: string): number[] =>
  (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);

const sound = (d: string, where: string) => {
  expect(d.startsWith('M'), `${where} : chemin vide`).toBe(true);
  expect(d.includes('NaN'), `${where} : NaN`).toBe(false);
  for (const value of numbers(d)) expect(Number.isFinite(value), `${where} : ${value}`).toBe(true);
};

describe('découpe du mannequin', () => {
  it('donne toujours les mêmes pièces dans le même ordre', () => {
    // Les chemins sont réécrits en place image par image, indexés par position :
    // un nombre de pièces variable les mélangerait entre deux poses.
    const reference = pieces(POSES.stand);
    for (const key of KEYS) {
      const made = pieces(POSES[key]);
      expect(made.length, key).toBe(reference.length);
      made.forEach((piece, i) => {
        expect(piece.part, `${key}[${i}]`).toBe(reference[i]!.part);
        expect(piece.seam ?? false, `${key}[${i}]`).toBe(reference[i]!.seam ?? false);
      });
    }
  });

  it('trace des chemins valides pour chaque pose', () => {
    for (const key of KEYS) {
      for (const piece of pieces(POSES[key])) sound(piece.d, `${key}/${piece.part}`);
      sound(headEgg(POSES[key]), `${key}/tête`);
    }
  }, 20000);

  it('trace des chemins valides à chaque image de chaque exercice', () => {
    // Les défauts sont collectés puis affirmés une fois : soixante mille
    // assertions individuelles coûtent plus cher que la géométrie qu'elles
    // vérifient.
    const broken: string[] = [];
    const check = (d: string, where: string) => {
      if (!d.startsWith('M') || d.includes('NaN') || numbers(d).some((v) => !Number.isFinite(v))) {
        broken.push(where);
      }
    };
    for (const exercise of EXERCISES) {
      for (let i = 0; i < 16; i++) {
        const pose = samplePoseCycle(exercise.poses, i / 16);
        for (const piece of pieces(pose)) check(piece.d, `${exercise.id}/${piece.part}`);
        check(headEgg(pose), `${exercise.id}/tête`);
      }
    }
    expect(broken.slice(0, 8)).toEqual([]);
  });

  it('survit à un membre entièrement replié', () => {
    // Deux articulations au même endroit, ou une rotule qui en avale une autre :
    // le cas dégénéré doit rendre une boule, pas un NaN.
    sound(taper([50, 50], 4, [50, 50], 2), 'os de longueur nulle');
    sound(taper([50, 50], 6, [51, 50], 2), 'rotule avalée');
    sound(taper([50, 50], 2, [70, 50], 2), 'os droit');
    sound(ball([50, 50], 3), 'rotule');
  });
});

describe('pieds', () => {
  it('n’ajoute jamais d’enfoncement à celui de la cheville', () => {
    // Le pied ne creuse pas : il ne descend pas plus bas que l'articulation dont
    // il part. Que cette articulation passe elle-même sous le sol en cours
    // d'interpolation est un défaut des poses, mesuré et documenté ailleurs.
    for (const exercise of EXERCISES) {
      for (let i = 0; i < 16; i++) {
        const pose = samplePoseCycle(exercise.poses, i / 16);
        for (const side of ['L', 'R'] as const) {
          const ankle = side === 'L' ? pose.footL : pose.footR;
          const { heel, toe } = footOf(pose, side, 1, false);
          const floor = Math.max(GROUND, ankle[1]);
          expect(Math.max(heel[1], toe[1]), `${exercise.id} pied ${side}`).toBeLessThan(floor + 1);
        }
      }
    }
  });

  it('met la figure sur la pointe des pieds quand elle est en appui facial', () => {
    // Un gainage dont les pieds sont posés à plat n'est pas un gainage.
    const { toe, heel } = footOf(POSES.plank, 'R', 1, true);
    expect(toe[1]).toBeGreaterThan(heel[1]);
    // Et debout, le pied repose à plat.
    const stood = footOf(POSES.stand, 'R', 1, false);
    expect(Math.abs(stood.toe[1] - stood.heel[1])).toBeLessThan(1);
  });
});
