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
import {
  BONES,
  emphasisFor,
  samplePoseCycle,
  supportFor,
  type Pose,
  type PoseKey,
} from '../src/data/poses';
import { PATTERN_CADENCE } from '../src/domain/model/taxonomy';
import { EXERCISES } from '../src/data/exercises';

const FRAMES = 8;
const CELL = 100;
const ROW = 108;
const OUT = 'figures.svg';

const INK = '#e8ecf4';
const DIM = '#8b93a7';
const BACK = '#12151c';
const SIGNAL = '#ff5a36';

function bones(pose: Pose, keys: readonly PoseKey[]): string {
  const emphasis = emphasisFor(keys, pose);
  const forward = (part: string): number =>
    part === 'core'
      ? 1
      : part === 'armL'
        ? (1 - emphasis.arms) / 2
        : part === 'armR'
          ? (1 + emphasis.arms) / 2
          : part === 'legL'
            ? (1 - emphasis.legs) / 2
            : (1 + emphasis.legs) / 2;
  const line = (
    a: [number, number] | readonly [number, number],
    b: [number, number] | readonly [number, number],
    colour: string,
    width: number,
    opacity: number,
  ) =>
    `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity.toFixed(3)}"/>`;
  return (
    BONES.filter(([, , part]) => part !== 'core')
      .map(([a, b, part]) => line(pose[a], pose[b], DIM, 3.4, 0.55 * (1 - forward(part))))
      .join('') +
    BONES.map(([a, b, part]) =>
      line(pose[a], pose[b], INK, part === 'core' ? 5 : 4.2, forward(part)),
    ).join('')
  );
}

const head = (pose: Pose): string =>
  `<circle cx="${pose.head[0].toFixed(1)}" cy="${pose.head[1].toFixed(1)}" r="6.6" fill="${SIGNAL}" stroke="${BACK}" stroke-width="1.2"/>`;

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
    .map(([x1, y1, x2, y2]) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2a3040" stroke-width="1.5" stroke-linecap="round"/>`)
    .join('');
  for (let frame = 0; frame < FRAMES; frame++) {
    const pose = samplePoseCycle(keys, frame / FRAMES, cadence);
    svg += `<g transform="translate(${frame * CELL},${row * ROW + 6})">`;
    svg += `<line x1="4" y1="98" x2="96" y2="98" stroke="#2a3040" stroke-width="1.5" stroke-linecap="round"/>`;
    svg += support + bones(pose, keys) + head(pose);
    if (frame === 0) {
      svg += `<text x="3" y="8" font-family="system-ui,sans-serif" font-size="6" fill="${DIM}">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    }
    svg += `</g>`;
  }
});

writeFileSync(OUT, svg + '</svg>');
console.log(`${OUT} : ${rows.length} séquences × ${FRAMES} images`);
