/**
 * Planche contact des animations d'exercices.
 *
 * Les tests mesurent ce qui est mesurable — longueur des os, appuis au sol,
 * continuité de la boucle. Ils ne disent pas si une pompe *ressemble* à une
 * pompe. Cet outil écrit une planche SVG de toute la bibliothèque, une ligne
 * par séquence, plusieurs images par répétition, à ouvrir dans un navigateur
 * après toute modification de `src/data/poses.ts`.
 *
 *     npm run figures
 */

import { writeFileSync } from 'node:fs';
import { emphasisFor, samplePoseCycle, supportFor, type Pose, type PoseKey } from '../src/data/poses';
import { headEgg, pieces } from '../src/ui/mannequin';
import { PATTERN_CADENCE } from '../src/domain/model/taxonomy';
import { EXERCISES } from '../src/data/exercises';

const FRAMES = 8;
const CELL = 100;
const ROW = 108;
const OUT = 'figures.svg';

const BACK = '#08090b';
const LINE = '#272c35';
const WOOD = '#dcc29c';
const SHADE = '#7b6a4e';
const EDGE = '#453a2c';
const SEAM = '#8d7555';

function figure(pose: Pose, keys: readonly PoseKey[]): string {
  const emphasis = emphasisFor(keys, pose);
  const far = (part: string): boolean =>
    part === 'armL'
      ? emphasis.arms > 0
      : part === 'armR'
        ? emphasis.arms < 0
        : part === 'legL'
          ? emphasis.legs > 0
          : part === 'legR'
            ? emphasis.legs < 0
            : false;
  const body = pieces(pose)
    .map((piece) =>
      piece.seam
        ? `<path d="${piece.d}" fill="none" stroke="${far(piece.part) ? EDGE : SEAM}" stroke-width="0.9"/>`
        : `<path d="${piece.d}" fill="${far(piece.part) ? SHADE : WOOD}" stroke="${EDGE}" stroke-width="0.7" stroke-linejoin="round"/>`,
    )
    .join('');
  return `${body}<path d="${headEgg(pose)}" fill="${WOOD}" stroke="${EDGE}" stroke-width="0.7"/>`;
}

const seen = new Set<string>();
const rows: { label: string; keys: readonly PoseKey[]; cadence: ReturnType<() => (typeof PATTERN_CADENCE)[keyof typeof PATTERN_CADENCE]> }[] = [];
for (const exercise of EXERCISES) {
  const id = exercise.poses.join('|');
  if (seen.has(id)) continue;
  seen.add(id);
  rows.push({ label: exercise.name, keys: exercise.poses, cadence: PATTERN_CADENCE[exercise.pattern] });
}

let svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAMES * CELL}" height="${rows.length * ROW}" ` +
  `viewBox="0 0 ${FRAMES * CELL} ${rows.length * ROW}"><rect width="100%" height="100%" fill="${BACK}"/>`;

rows.forEach(({ label, keys, cadence }, row) => {
  const support = supportFor(keys)
    .map(([x1, y1, x2, y2]) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${LINE}" stroke-width="1.5" stroke-linecap="round"/>`)
    .join('');
  for (let frame = 0; frame < FRAMES; frame++) {
    const pose = samplePoseCycle(keys, frame / FRAMES, cadence);
    svg += `<g transform="translate(${frame * CELL},${row * ROW + 6})">`;
    svg += `<line x1="4" y1="98" x2="96" y2="98" stroke="${LINE}" stroke-width="1.5" stroke-linecap="round"/>`;
    svg += support + figure(pose, keys);
    if (frame === 0) {
      svg += `<text x="3" y="8" font-family="system-ui,sans-serif" font-size="6" fill="#8b93a7">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    }
    svg += `</g>`;
  }
});

writeFileSync(OUT, svg + '</svg>');
console.log(`${OUT} : ${rows.length} séquences × ${FRAMES} images`);
