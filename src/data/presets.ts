import type { TimerPreset } from '@/domain/model/boxing';
import { presetId } from '@/domain/model/ids';

/** Built-in round structures (§28). Custom presets are stored alongside these. */
export const BUILT_IN_PRESETS: readonly TimerPreset[] = [
  {
    id: presetId('boxing'),
    name: 'Boxing',
    rounds: 6,
    workSec: 180,
    restSec: 60,
    prepSec: 10,
    builtIn: true,
  },
  {
    id: presetId('short-round'),
    name: 'Short Round',
    rounds: 8,
    workSec: 120,
    restSec: 30,
    prepSec: 10,
    builtIn: true,
  },
  {
    id: presetId('hiit'),
    name: 'HIIT',
    rounds: 10,
    workSec: 40,
    restSec: 20,
    prepSec: 10,
    builtIn: true,
  },
  {
    id: presetId('tabata'),
    name: 'Tabata',
    rounds: 8,
    workSec: 20,
    restSec: 10,
    prepSec: 10,
    builtIn: true,
  },
];

/** Total wall-clock seconds of a preset, prep included, last rest excluded. */
export const presetDuration = (p: TimerPreset): number =>
  p.prepSec + p.rounds * p.workSec + Math.max(0, p.rounds - 1) * p.restSec;
