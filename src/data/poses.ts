/**
 * Vector pose library.
 *
 * Every exercise is illustrated by walking a 13-joint skeleton through a short
 * sequence of poses drawn in a 0–100 viewBox with the floor at y = 96. This
 * keeps the whole illustration set at a few kilobytes, works offline, animates
 * the movement rather than freezing it, and owes nothing to any third-party
 * artwork.
 *
 * The coordinates below are the *drawing*: they fix what each joint is doing.
 * `skeleton.ts` then rebuilds every one of them over a single set of
 * anatomically-proportioned bones and plants it on the floor, so the same
 * movement is shown by the same body in every exercise. Editing a pose here
 * means editing the movement, never the anatomy.
 *
 * Replacing a pose animation with a real photo, GIF or video is a one-field
 * change on the exercise (`media`), so upgrading the visuals later touches no
 * rendering code.
 */

import {
  ANCHORS,
  JOINT_ORDER,
  breatheRig,
  contactsOf,
  lerpRig,
  normalise,
  rigDistance,
  supportSegments,
  toPose,
  toRig,
  trunkHeight,
  type Joint,
  type Pose,
  type Pt,
  type Rig,
  type Segment,
  type SupportKind,
} from './skeleton';

export { BONES, JOINT_ORDER, GROUND, BONE_LENGTH } from './skeleton';
export type { Pose, Pt, Joint, BonePart, Segment } from './skeleton';

/** Parse the compact "x,y x,y …" authoring format into a Pose. */
function P(spec: string): Pose {
  const pts = spec.trim().split(/\s+/).map((t) => {
    const [x, y] = t.split(',').map(Number);
    return [x ?? 0, y ?? 0] as Pt;
  });
  if (pts.length !== JOINT_ORDER.length) {
    throw new Error(`Pose needs ${JOINT_ORDER.length} joints, got ${pts.length}`);
  }
  const out = {} as Record<Joint, Pt>;
  JOINT_ORDER.forEach((k, i) => {
    out[k] = pts[i]!;
  });
  return out as Pose;
}

// Joint order: head neck hip shL elL haL shR elR haR knL ftL knR ftR
/**
 * The artwork, before normalisation. Exported for tests and tooling, which
 * check that what the drawing says — which joints are on the floor, which way
 * a joint bends — survives the rebuild. Screens draw `POSES`.
 */
export const DRAWN = {
  /* ---------------------------------------------------------------- debout */
  stand: P('50,12 50,22 50,52 46,24 44,36 43,48 54,24 56,36 57,48 47,74 46,96 53,74 54,96'),
  standTall: P('50,10 50,20 50,50 46,22 44,33 43,44 54,22 56,33 57,44 48,72 47,96 52,72 53,96'),
  armsOverhead: P('50,12 50,22 50,52 46,24 42,14 44,4 54,24 58,14 56,4 47,74 46,96 53,74 54,96'),
  guard: P('50,13 50,23 50,53 45,25 41,32 47,19 55,25 60,33 53,20 45,74 42,96 56,73 60,96'),
  reach: P('50,14 50,24 50,54 46,26 40,20 34,14 54,26 60,20 66,14 47,75 46,96 53,75 54,96'),

  /* -------------------------------------------------------------- poussées */
  pushTop: P('20,46 28,50 58,58 28,52 28,68 28,84 30,50 30,66 30,82 74,62 88,84 76,60 90,82'),
  pushBottom: P('18,62 27,64 58,66 27,64 20,76 28,84 29,62 22,74 30,82 74,68 88,86 76,66 90,84'),
  pushKneeTop: P('22,48 30,52 58,60 30,54 30,70 30,84 32,52 32,68 32,82 74,72 88,80 76,70 90,78'),
  pushKneeBottom: P('20,64 29,66 58,68 29,66 22,78 30,84 31,64 24,76 32,82 74,74 88,82 76,72 90,80'),
  pushInclineTop: P('26,32 34,37 62,54 34,39 34,52 34,66 36,37 36,50 36,64 76,68 90,88 78,66 92,86'),
  pushInclineBottom: P('24,46 33,49 62,60 33,49 26,58 34,66 35,47 28,56 36,64 76,72 90,90 78,70 92,88'),
  pushDeclineTop: P('22,58 30,60 60,46 30,62 30,74 30,86 32,60 32,72 32,84 74,44 86,66 76,42 88,64'),
  pushDeclineBottom: P('20,72 29,72 60,50 29,74 22,80 30,86 31,72 24,78 32,84 74,46 86,68 76,44 88,66'),
  pikeTop: P('30,54 36,50 62,26 36,52 32,68 30,84 38,50 34,66 32,82 74,52 88,86 76,50 90,84'),
  pikeBottom: P('26,70 33,64 62,28 33,66 26,76 30,84 35,64 28,74 32,82 74,54 88,88 76,52 90,86'),
  plank: P('20,50 28,54 58,60 28,56 28,70 28,84 30,54 30,68 30,82 74,64 88,84 76,62 90,82'),
  plankTapA: P('20,50 28,54 58,60 28,56 28,70 28,84 30,54 44,58 56,54 74,64 88,84 76,62 90,82'),
  plankTapB: P('20,50 28,54 58,60 28,56 42,60 54,56 30,54 30,68 30,82 74,64 88,84 76,62 90,82'),
  dips: P('48,26 50,34 54,58 47,34 42,48 40,60 53,34 58,48 60,60 60,76 66,94 64,76 70,92'),
  dipsDown: P('48,38 50,46 54,66 47,46 40,56 40,60 53,46 60,56 60,60 62,80 66,94 66,80 70,92'),

  /* --------------------------------------------------------------- tirages */
  hang: P('50,24 50,32 50,58 46,32 42,20 38,8 54,32 58,20 62,8 48,78 47,96 52,78 53,96'),
  pullTop: P('50,22 50,30 50,58 44,32 30,28 38,8 56,32 70,28 62,8 47,78 46,96 53,78 54,96'),
  rowTop: P('26,52 34,54 62,64 34,56 34,44 34,34 36,56 36,44 36,34 76,72 90,90 78,70 92,88'),
  rowBottom: P('30,44 38,48 62,62 38,48 32,40 34,34 40,48 34,40 36,34 76,70 90,90 78,68 92,88'),
  superman: P('22,62 30,64 58,68 30,64 24,58 18,52 32,64 26,58 20,52 74,70 88,64 76,68 90,62'),
  supermanLift: P('22,54 30,58 58,66 30,58 24,48 18,42 32,58 26,48 20,42 74,68 88,56 76,66 90,54'),

  /* ---------------------------------------------------- squats & charnière */
  squatBottom: P('48,30 49,40 50,62 44,42 40,52 40,40 54,42 58,52 58,40 40,76 44,96 60,76 56,96'),
  squatMid: P('49,22 50,31 50,56 45,33 42,44 42,34 55,33 59,44 58,34 44,76 45,96 57,76 55,96'),
  jumpAir: P('50,8 50,18 50,44 45,20 40,12 38,4 55,20 60,12 62,4 48,64 46,84 52,64 54,84'),
  jumpLand: P('49,26 50,35 50,58 44,37 40,48 40,36 55,37 60,48 60,36 42,76 45,96 58,76 55,96'),
  lungeTop: P('50,12 50,22 50,52 46,24 44,36 43,48 54,24 56,36 57,48 47,74 46,96 53,74 54,96'),
  lungeBottom: P('50,20 50,30 50,58 45,32 43,44 42,54 55,32 57,44 58,54 32,74 30,96 66,72 70,96'),
  splitBottom: P('50,20 50,30 50,58 45,32 43,44 42,54 55,32 57,44 58,54 36,76 34,96 64,70 72,92'),
  pistolBottom: P('44,32 46,42 48,64 40,44 34,52 30,46 52,44 58,52 62,46 42,78 44,96 66,60 84,58'),
  wallSit: P('34,28 36,38 38,62 32,40 28,52 26,64 40,40 44,52 46,64 62,64 64,92 64,64 66,92'),
  cossackL: P('40,26 42,36 44,60 36,38 30,48 26,56 48,38 54,46 60,52 34,76 30,96 74,70 88,94'),
  hingeTop: P('50,12 50,22 50,52 46,24 44,36 43,48 54,24 56,36 57,48 47,74 46,96 53,74 54,96'),
  hingeBottom: P('30,34 38,36 60,50 38,38 34,52 32,64 40,38 36,52 34,64 58,74 56,96 62,74 60,96'),
  bridgeDown: P('20,66 28,68 52,80 28,70 22,78 18,84 30,70 24,78 20,84 72,62 88,86 74,60 90,84'),
  bridgeTop: P('20,66 28,68 54,58 28,70 22,78 18,84 30,70 24,78 20,84 72,60 88,86 74,58 90,84'),
  nordicTop: P('34,36 38,42 52,62 37,44 32,54 28,62 40,44 36,54 32,62 76,72 90,80 78,70 92,78'),
  nordicMid: P('26,50 32,54 52,64 31,56 24,64 20,70 34,56 28,64 22,70 76,74 90,82 78,72 92,80'),
  calfDown: P('50,14 50,24 50,54 46,26 44,38 43,50 54,26 56,38 57,50 48,76 47,96 52,76 53,96'),
  calfUp: P('50,8 50,18 50,48 46,20 44,32 43,44 54,20 56,32 57,44 48,70 47,90 52,70 53,90'),

  /* ------------------------------------------------------------------ core */
  hollow: P('26,60 34,62 58,64 34,62 26,54 18,48 36,62 28,54 20,48 78,58 92,48 80,58 94,48'),
  hollowTuck: P('28,62 36,64 58,66 36,64 28,56 20,50 38,64 30,56 22,50 74,54 84,68 76,54 86,68'),
  deadbugA: P('22,64 30,66 56,70 30,66 22,58 16,52 32,66 26,60 22,66 76,56 88,46 74,70 90,72'),
  deadbugB: P('22,64 30,66 56,70 30,66 24,62 20,68 32,66 24,56 16,50 74,70 90,72 76,56 88,46'),
  crunchDown: P('22,64 30,66 56,70 30,66 26,58 24,52 32,66 28,58 26,52 76,54 92,70 78,54 94,70'),
  crunchUp: P('34,54 40,60 56,70 40,58 36,50 34,44 42,58 38,50 36,44 76,54 92,70 78,54 94,70'),
  vUpDown: P('20,64 28,66 56,70 28,66 20,58 14,52 30,66 22,58 16,52 78,66 94,68 80,66 96,68'),
  vUpTop: P('38,44 42,52 56,70 42,50 50,42 58,36 44,50 52,42 60,36 74,52 88,38 76,52 90,38'),
  sidePlank: P('22,50 30,54 58,66 30,56 28,72 28,86 32,52 34,38 36,24 76,72 92,86 78,70 94,84'),
  sidePlankDown: P('22,62 30,62 58,70 30,64 28,76 28,86 32,60 34,48 36,36 76,76 92,88 78,74 94,86'),
  climberA: P('20,48 28,52 58,58 28,54 28,68 28,84 30,52 30,66 30,82 38,56 46,74 76,60 90,82'),
  climberB: P('20,48 28,52 58,58 28,54 28,68 28,84 30,52 30,66 30,82 76,60 90,82 38,56 46,74'),
  twistL: P('34,50 40,58 58,72 40,56 34,62 30,68 42,58 40,66 38,72 76,58 92,70 78,58 94,70'),
  twistR: P('34,50 40,58 58,72 40,56 44,64 48,70 42,58 46,60 50,64 76,58 92,70 78,58 94,70'),
  birdDogA: P('22,52 30,56 58,62 30,58 22,50 14,44 32,56 32,70 32,84 76,66 90,84 78,58 94,48'),
  birdDogB: P('22,52 30,56 58,62 30,58 30,72 30,86 32,56 24,50 16,44 76,58 92,48 78,66 92,84'),
  hipDip: P('22,50 30,54 58,66 30,56 28,72 28,86 32,52 34,38 36,24 76,72 92,86 78,70 94,84'),

  /* ------------------------------------------------- locomotion & plyo */
  burpeeStand: P('50,12 50,22 50,52 46,24 44,36 43,48 54,24 56,36 57,48 47,74 46,96 53,74 54,96'),
  burpeeCrouch: P('44,44 46,52 50,66 42,54 36,66 32,78 50,54 54,66 56,78 46,80 44,96 56,80 58,96'),
  burpeePlank: P('20,50 28,54 58,60 28,56 28,70 28,84 30,54 30,68 30,82 74,64 88,84 76,62 90,82'),
  kneeHighL: P('50,12 50,22 50,52 44,24 40,32 44,20 56,24 60,34 58,44 42,52 40,66 54,74 56,96'),
  kneeHighR: P('50,12 50,22 50,52 44,24 40,34 42,44 56,24 60,32 56,20 46,74 44,96 58,52 60,66'),
  skaterL: P('36,22 40,30 48,54 36,32 30,42 26,50 44,32 48,44 50,54 38,76 32,96 66,64 80,76'),
  skaterR: P('64,22 60,30 52,54 56,32 52,44 50,54 64,32 70,42 74,50 62,76 68,96 34,64 20,76'),
  bearA: P('26,54 34,56 60,58 34,58 32,72 32,86 36,56 36,70 36,84 72,64 86,86 74,62 88,84'),
  bearB: P('26,54 34,56 60,58 34,58 48,64 58,58 36,56 36,70 36,84 72,64 86,86 78,48 88,66'),
  broadJump: P('44,16 46,26 52,48 42,28 34,22 28,16 50,28 58,22 64,16 48,66 44,84 54,66 58,84'),
  sprawlDown: P('22,60 30,62 58,66 30,62 24,72 26,84 32,62 34,74 34,86 74,70 88,86 76,68 90,84'),

  /* ---------------------------------------------------------------- boxing */
  jab: P('50,13 50,23 50,53 45,25 32,24 20,22 55,25 60,33 53,20 45,74 42,96 56,73 60,96'),
  cross: P('50,13 50,23 50,53 45,25 41,32 47,19 55,25 40,26 24,22 46,74 43,96 57,72 61,96'),
  hookLead: P('50,13 50,23 50,53 45,25 34,20 24,28 55,25 60,33 53,20 45,74 42,96 56,73 60,96'),
  uppercut: P('50,13 50,23 50,53 45,27 42,18 46,8 55,25 60,33 53,20 45,74 42,96 56,73 60,96'),
  slipLeft: P('42,17 47,25 50,53 42,27 38,34 44,21 53,26 58,34 51,21 45,74 42,96 56,73 60,96'),
  slipRight: P('58,17 53,25 50,53 47,27 44,34 50,21 57,26 62,34 55,21 45,74 42,96 56,73 60,96'),

  /* -------------------------------------------------------------- mobilité */
  cat: P('22,56 30,58 58,52 30,60 30,72 30,86 32,58 32,70 32,84 72,64 86,86 74,62 88,84'),
  cow: P('22,48 30,54 58,66 30,56 30,70 30,86 32,54 32,68 32,84 72,66 86,86 74,64 88,84'),
  childPose: P('20,66 28,66 58,66 28,66 20,62 12,58 30,66 22,62 14,58 74,72 86,84 76,70 88,82'),
  downDog: P('28,62 34,56 62,26 34,58 30,72 28,86 36,56 32,70 30,84 76,54 90,86 78,52 92,84'),
  worldsGreatest: P('28,40 34,46 56,62 34,48 30,62 28,74 36,46 38,32 40,20 46,68 40,88 74,72 88,86'),
  hipFlexor: P('44,24 46,34 50,58 40,36 34,26 30,16 52,36 58,26 62,16 42,74 34,94 70,70 86,88'),
  hamstringStretch: P('26,54 32,56 56,68 32,56 24,62 18,66 34,56 26,62 20,66 78,66 94,58 80,66 96,58'),
  thoracicA: P('24,56 32,58 58,64 32,58 26,52 20,46 34,58 34,72 34,86 74,66 88,84 76,64 90,82'),
  thoracicB: P('24,56 32,58 58,64 32,58 26,52 20,46 34,58 40,44 44,30 74,66 88,84 76,64 90,82'),
  breathe: P('50,16 50,26 50,56 46,28 44,42 46,54 54,28 56,42 54,54 46,76 45,96 54,76 55,96'),
  breatheIn: P('50,14 50,24 50,54 46,26 42,38 42,50 54,26 58,38 58,50 46,76 45,96 54,76 55,96'),
} as const;
export type PoseKey = keyof typeof DRAWN;

const GROUND_ANCHOR = { kind: 'ground' } as const;
const NORMALISED = new Map<PoseKey, Pose>();
const RIG_CACHE = new Map<PoseKey, Rig>();

/**
 * Normalising a drawing costs a fraction of a millisecond, and no screen shows
 * the whole library at once, so it is done on first use rather than at import:
 * a session that demonstrates six exercises pays for six drawings, not eighty-nine.
 */
function poseOf(key: PoseKey): Pose {
  let pose = NORMALISED.get(key);
  if (!pose) {
    pose = normalise(DRAWN[key], ANCHORS[key] ?? GROUND_ANCHOR);
    NORMALISED.set(key, pose);
  }
  return pose;
}

function rigOf(key: PoseKey): Rig {
  let rig = RIG_CACHE.get(key);
  if (!rig) {
    rig = toRig(poseOf(key));
    RIG_CACHE.set(key, rig);
  }
  return rig;
}

const BREATH_CACHE = new Map<PoseKey, Rig>();
/** How far the farthest joint should travel over one breath, in viewBox units. */
const BREATH_TRAVEL = 2.6;

/**
 * The same pose, one breath in.
 *
 * The chest opens, and because limb angles are held against the trunk the rest
 * of the body rides along — then the figure is slid back down so its supports
 * stay where they were, since a breath lifts the body and not the floor.
 *
 * The amount is solved per pose: the same rotation of the trunk moves a
 * downward dog's heels ten times as far as a boxer's guard, because the lever
 * is ten times longer. Every held position gets the same amount of life,
 * whatever shape it is held in.
 */
function breathOf(key: PoseKey): Rig {
  let cached = BREATH_CACHE.get(key);
  if (!cached) {
    const rest = rigOf(key);
    const still = poseOf(key);
    const contacts = contactsOf(DRAWN[key]);
    const breathe = (amount: number): Rig => {
      const swelled = breatheRig(rest, amount);
      const raw = toPose(swelled);
      const drift =
        contacts.length > 0
          ? contacts.reduce((sum, j) => sum + (still[j][1] - raw[j][1]), 0) / contacts.length
          : 0;
      return { root: [rest.root[0], rest.root[1] + drift], angles: swelled.angles };
    };
    const probe = toPose(breathe(1));
    const reach = Math.max(
      ...JOINT_ORDER.map((j) => Math.hypot(probe[j][0] - still[j][0], probe[j][1] - still[j][1])),
    );
    cached = breathe(reach > 0.05 ? BREATH_TRAVEL / reach : 1);
    BREATH_CACHE.set(key, cached);
  }
  return cached;
}

/** The drawn poses, rebuilt on the canonical skeleton and planted on the floor. */
export const POSES: Readonly<Record<PoseKey, Pose>> = Object.defineProperties(
  {} as Record<PoseKey, Pose>,
  Object.fromEntries(
    (Object.keys(DRAWN) as PoseKey[]).map((k) => [
      k,
      { get: () => poseOf(k), enumerable: true } as PropertyDescriptor,
    ]),
  ),
);

/** Interpolate between two poses: hips travel, joints rotate, bones keep their length. */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return toPose(lerpRig(toRig(a), toRig(b), t));
}

/* ----------------------------------------------------------------- appuis */

/**
 * Which poses rest on something the drawing does not include.
 *
 * Keyed by pose rather than by exercise because the figure is all the renderer
 * is given — and because two exercises that share a pose share its support.
 * The pike push-up is deliberately absent: its poses serve both the floor
 * version and the feet-elevated one.
 */
const SUPPORTS: Partial<Record<PoseKey, SupportKind>> = {
  pushInclineTop: 'benchHands',
  pushInclineBottom: 'benchHands',
  pushDeclineTop: 'benchFeet',
  pushDeclineBottom: 'benchFeet',
  dips: 'benchHands',
  dipsDown: 'benchHands',
  wallSit: 'wall',
  rowTop: 'bar',
  rowBottom: 'bar',
  hang: 'bar',
  pullTop: 'bar',
};

const SUPPORT_CACHE = new Map<string, readonly Segment[]>();

/**
 * The wall, chair or bar the movement needs, as lines to draw.
 *
 * Taken from the first pose of the sequence so the support stays put while the
 * body moves — a bar that drifted with the hands would defeat the point, which
 * is to show that the hands are what is not moving.
 */
export function supportFor(keys: readonly PoseKey[]): readonly Segment[] {
  const id = keys.join('|');
  let segments = SUPPORT_CACHE.get(id);
  if (!segments) {
    const key = keys.find((k) => SUPPORTS[k]);
    const kind = key ? SUPPORTS[key] : undefined;
    segments = key && kind ? supportSegments(kind, poseOf(key)) : [];
    SUPPORT_CACHE.set(id, segments);
  }
  return segments;
}

/* -------------------------------------------------------- membre moteur */

/** Which side is doing the work: −1 fully left, +1 fully right. */
export interface Emphasis {
  readonly arms: number;
  readonly legs: number;
}

/**
 * Right side forward when both sides are doing the same thing — the drawing
 * convention the library has always used, kept for every symmetric movement.
 */
const NEUTRAL = 0.5;
/**
 * A signal below `QUIET` is treated as no signal at all, and one at `DECISIVE`
 * as a full lead. Without the dead band, a drawing that is very slightly
 * asymmetric — every push-up in the library — makes the shading drift from one
 * side to the other through the repetition, which is worse than not moving.
 */
const QUIET = 0.25;
const DECISIVE = 0.7;

interface Reference {
  readonly mean: Pose;
  /** Each limb's widest departure from that average, over the sequence. */
  readonly spread: Readonly<Record<'armL' | 'armR' | 'legL' | 'legR', number>>;
  /** Whether the two sides take turns, rather than moving together. */
  readonly alternating: { readonly arms: boolean; readonly legs: boolean };
}

const REFERENCE_CACHE = new Map<string, Reference>();

const gap = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

const departureOf = (pose: Pose, mean: Pose, j: readonly [Joint, Joint]): number =>
  gap(pose[j[0]!], mean[j[0]!]) + gap(pose[j[1]!], mean[j[1]!]) * 0.6;

const LIMB_JOINTS = {
  armL: ['elbowL', 'handL'],
  armR: ['elbowR', 'handR'],
  legL: ['kneeL', 'footL'],
  legR: ['kneeR', 'footR'],
} as const satisfies Record<string, readonly [Joint, Joint]>;

/** Frames sampled once per sequence to describe what it does on average. */
const REFERENCE_SAMPLES = 24;

/**
 * Do these two limbs take turns, or do they move together?
 *
 * This is the question the whole thing turns on. A push-up, a squat, a row
 * move both sides at once: there is no working side to bring forward, and any
 * attempt to find one makes the shading drift from left to right through the
 * repetition — worse than leaving it alone. A shoulder tap, a jab, a knee
 * drive alternate, and there the side that is working must be the one you see.
 *
 * Told apart by asking *when* one side is where the other was. Alternating
 * means the right limb reaches, half a repetition later, the place the left
 * limb is now: a cross lands where the jab landed, the second knee rises where
 * the first did. A movement that does the same thing on both sides at once
 * never matches itself better half a cycle out than it does right now.
 *
 * Comparing how far each limb strays from the average does not work, however
 * it is dressed up: both hands of a jab-cross reach an extreme at the same
 * moment — opposite extremes, but the same distance.
 */
function takesTurns(
  frames: readonly Pose[],
  left: keyof typeof LIMB_JOINTS,
  right: keyof typeof LIMB_JOINTS,
): boolean {
  const [lMid, lTip] = LIMB_JOINTS[left];
  const [rMid, rTip] = LIMB_JOINTS[right];
  // Compared both as drawn and mirrored about the midline, keeping whichever
  // fits better: seen from the side the two limbs sit on top of each other, and
  // seen from the front they are mirror images. Testing only one way classifies
  // every exercise drawn from the other view wrongly.
  const apart = (lag: number): number => {
    let sum = 0;
    for (let i = 0; i < frames.length; i++) {
      const here = frames[i]!;
      const there = frames[(i + lag) % frames.length]!;
      const axis = there.hip[0];
      const flip = (p: Pt): Pt => [2 * axis - p[0], p[1]];
      sum += Math.min(
        gap(here[lMid], there[rMid]) + gap(here[lTip], there[rTip]),
        gap(here[lMid], flip(there[rMid])) + gap(here[lTip], flip(there[rTip])),
      );
    }
    return sum / frames.length;
  };
  const together = apart(0);
  const offset = apart(Math.round(frames.length / 2));
  if (together < 1 && offset < 1) return false;
  return offset < together * 0.6;
}

function referenceFor(keys: readonly PoseKey[]): Reference {
  const id = keys.join('|');
  let reference = REFERENCE_CACHE.get(id);
  if (!reference) {
    // Sampled along the movement rather than at its keyframes: an average taken
    // from the keyframes alone sits beside the path the body actually follows,
    // and every frame in between then reads as a departure.
    const frames = Array.from({ length: REFERENCE_SAMPLES }, (_, i) =>
      samplePoseCycle(keys, i / REFERENCE_SAMPLES),
    );
    const mean = {} as Record<Joint, Pt>;
    for (const joint of JOINT_ORDER) {
      mean[joint] = [
        frames.reduce((sum, f) => sum + f[joint][0], 0) / frames.length,
        frames.reduce((sum, f) => sum + f[joint][1], 0) / frames.length,
      ];
    }
    const meanPose = mean as Pose;
    const spread = {} as Record<keyof typeof LIMB_JOINTS, number>;
    for (const limb of Object.keys(LIMB_JOINTS) as (keyof typeof LIMB_JOINTS)[]) {
      spread[limb] = Math.max(
        0.5,
        ...frames.map((frame) => departureOf(frame, meanPose, LIMB_JOINTS[limb])),
      );
    }
    reference = {
      mean: meanPose,
      spread,
      alternating: {
        arms: takesTurns(frames, 'armL', 'armR'),
        legs: takesTurns(frames, 'legL', 'legR'),
      },
    };
    REFERENCE_CACHE.set(id, reference);
  }
  return reference;
}

function lead(
  pose: Pose,
  reference: Reference,
  left: keyof typeof LIMB_JOINTS,
  right: keyof typeof LIMB_JOINTS,
  tiebreak: (pose: Pose) => number,
): number {
  // Each limb is measured against its *own* widest departure, not against the
  // other one. Drawings are never quite symmetric — collarbones especially —
  // so raw departures differ even when both arms are doing the same thing, and
  // comparing them directly made a push-up drift from one side to the other.
  // What actually distinguishes an alternating movement is *when* each limb
  // reaches its extreme, and that survives the normalisation.
  const l = departureOf(pose, reference.mean, LIMB_JOINTS[left]) / reference.spread[left];
  const r = departureOf(pose, reference.mean, LIMB_JOINTS[right]) / reference.spread[right];
  const signal = (r - l) * 1.4 + tiebreak(pose) * 0.6;
  const strength = Math.max(0, Math.min(1, (Math.abs(signal) - QUIET) / (DECISIVE - QUIET)));
  return NEUTRAL * (1 - strength) + Math.sign(signal) * strength;
}

/**
 * An arm leads when it is lifted off the floor — a shoulder tap, a crawl — or
 * thrown clear of the body — a jab, a cross. Neither test alone is enough: a
 * planted arm and a punching arm are the same straight line, and two hands at
 * guard height are the same height.
 */
const armLead = (pose: Pose): number =>
  (pose.handL[1] - pose.handR[1]) / 24 +
  ((Math.abs(pose.handR[0] - pose.hip[0]) - Math.abs(pose.handL[0] - pose.hip[0])) / 20) * 0.8;

/**
 * A leg leads when it is lifted and when it is folded — a knee drive, a
 * mountain climber's tuck. Height alone is too quiet once the figure is planted
 * on the floor, where a tucked foot ends up barely above the standing one.
 */
const legLead = (pose: Pose): number =>
  (pose.footL[1] - pose.footR[1]) / 14 +
  (gap(pose.hip, pose.footL) - gap(pose.hip, pose.footR)) / 22;

export function emphasisFor(keys: readonly PoseKey[], pose: Pose): Emphasis {
  if (keys.length < 2) return { arms: NEUTRAL, legs: NEUTRAL };
  const reference = referenceFor(keys);
  return {
    arms: reference.alternating.arms ? lead(pose, reference, 'armL', 'armR', armLead) : NEUTRAL,
    legs: reference.alternating.legs ? lead(pose, reference, 'legL', 'legR', legLead) : NEUTRAL,
  };
}

/* --------------------------------------------------------------- cadencing */

/** Trunk travel counted as a full range of motion, for the eccentric bias. */
const FULL_RANGE = 7;

/**
 * How a repetition is phrased.
 *
 * A jump, a stretch and a punch are not the same sentence. A jump hangs at the
 * top and lands soft; a stretch is even and held at both ends; a punch snaps
 * out and sits back in the guard. One shared rhythm made all three read as the
 * same generic up-and-down.
 *
 * `home` is the position a sequence keeps coming back to — a guard, a plank
 * between two shoulder taps. `loaded` is the bottom of the range, `extended`
 * the top. Each number is the share of the repetition spent held there.
 */
export type Cadence = 'standard' | 'explosif' | 'souple' | 'vif';

interface Phrasing {
  readonly home: number;
  readonly loaded: number;
  readonly extended: number;
  /** How much slower the lowering half runs than the lifting half. */
  readonly eccentric: number;
}

const PHRASING: Readonly<Record<Cadence, Phrasing>> = {
  standard: { home: 0.06, loaded: 0.09, extended: 0.05, eccentric: 0.35 },
  explosif: { home: 0.05, loaded: 0.05, extended: 0.15, eccentric: 0.5 },
  souple: { home: 0.1, loaded: 0.11, extended: 0.11, eccentric: 0.15 },
  vif: { home: 0.11, loaded: 0.05, extended: 0.05, eccentric: 0.2 },
};

type Entry =
  | { readonly kind: 'hold'; readonly end: number; readonly frame: number }
  | { readonly kind: 'run'; readonly end: number; readonly span: number; readonly at: readonly number[] };

interface Cycle {
  readonly frames: readonly Rig[];
  readonly entries: readonly Entry[];
}

/**
 * Turn a pose sequence into a timed, closed loop.
 *
 * Three things make the difference between a diagram twitching and a coach
 * demonstrating. The loop is *closed* — the last frame is the first one, so the
 * figure never teleports back to the start. Time inside a movement is spread by
 * how far the body actually travels, so passing through a mid-position no
 * longer costs as much as a full descent. And the ends of the range are *held*,
 * with the figure easing in and out of them, which is what turns continuous
 * wobble into visible repetitions.
 */
function buildCycle(keys: readonly PoseKey[], cadence: Cadence): Cycle {
  const cyclic = new Set(keys).size < keys.length;
  const order: PoseKey[] = cyclic
    ? [...keys, keys[0]!]
    : [...keys, ...keys.slice(0, -1).reverse()];
  const frames = order.map((k) => rigOf(k));
  const poses = order.map((k) => poseOf(k));

  // Turnarounds: where the movement changes direction and the figure pauses.
  const stops = cyclic
    ? order.map((_, i) => i)
    : [0, keys.length - 1, order.length - 1];

  const phrasing = PHRASING[cadence];
  const average = poses.reduce((sum, p) => sum + trunkHeight(p), 0) / poses.length;
  const holdAt = (frame: number): number => {
    const key = order[frame]!;
    if (keys.filter((k) => k === key).length > 1) return phrasing.home;
    return trunkHeight(poses[frame]!) > average ? phrasing.loaded : phrasing.extended;
  };

  const runs = stops.slice(0, -1).map((from, i) => {
    const to = stops[i + 1]!;
    const costs: number[] = [];
    for (let j = from; j < to; j++) costs.push(Math.max(0.001, rigDistance(frames[j]!, frames[j + 1]!)));
    const total = costs.reduce((s, c) => s + c, 0);
    // Lowering the body is the eccentric half: under control, so slower.
    const drop = trunkHeight(poses[to]!) - trunkHeight(poses[from]!);
    const bias = 1 + phrasing.eccentric * Math.max(-1, Math.min(1, drop / FULL_RANGE));
    const at = costs.reduce<number[]>((acc, c) => [...acc, acc[acc.length - 1]! + c / total], [0]);
    return { from, to, weight: total * bias, at };
  });

  const holds = runs.map((run) => holdAt(run.from));
  const holdTotal = Math.min(0.45, holds.reduce((sum, h) => sum + h, 0));
  const holdScale = holdTotal / (holds.reduce((sum, h) => sum + h, 0) || 1);
  const moveTotal = 1 - holdTotal;
  const weightSum = runs.reduce((s, r) => s + r.weight, 0) || 1;

  const entries: Entry[] = [];
  let cursor = 0;
  runs.forEach((run, i) => {
    cursor += holds[i]! * holdScale;
    entries.push({ kind: 'hold', end: cursor, frame: run.from });
    cursor += (run.weight / weightSum) * moveTotal;
    entries.push({ kind: 'run', end: cursor, span: run.from, at: run.at });
  });
  const last = entries[entries.length - 1]!;
  entries[entries.length - 1] = { ...last, end: 1 } as Entry;

  return { frames, entries };
}

const CYCLES = new Map<string, Cycle>();

function cycleFor(keys: readonly PoseKey[], cadence: Cadence): Cycle {
  const id = `${cadence}/${keys.join('|')}`;
  let built = CYCLES.get(id);
  if (!built) {
    built = buildCycle(keys, cadence);
    CYCLES.set(id, built);
  }
  return built;
}

/** Zero velocity *and* zero acceleration at both ends: no visible kick. */
const smootherstep = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Sample a looping animation across a pose sequence.
 * `phase` runs 0…1 over one complete repetition.
 */
export function samplePoseCycle(
  keys: readonly PoseKey[],
  phase: number,
  cadence: Cadence = 'standard',
): Pose {
  const seq = keys.length > 0 ? keys : (['stand'] as const);
  const p = ((phase % 1) + 1) % 1;

  // A held position has no repetition to phrase — it breathes instead.
  if (seq.length === 1) {
    const key = seq[0]!;
    return toPose(lerpRig(rigOf(key), breathOf(key), (1 - Math.cos(2 * Math.PI * p)) / 2));
  }

  const { frames, entries } = cycleFor(seq, cadence);

  let i = 0;
  while (i < entries.length - 1 && p >= entries[i]!.end) i++;
  const entry = entries[i]!;
  if (entry.kind === 'hold') return toPose(frames[entry.frame]!);

  const start = i === 0 ? 0 : entries[i - 1]!.end;
  const u = smootherstep(Math.max(0, Math.min(1, (p - start) / Math.max(1e-6, entry.end - start))));

  // Even travel through the run: a long segment takes proportionally longer.
  const { at, span } = entry;
  let s = 0;
  while (s < at.length - 2 && u >= at[s + 1]!) s++;
  const a = at[s]!;
  const b = at[s + 1]!;
  const local = (u - a) / Math.max(1e-6, b - a);
  return toPose(lerpRig(frames[span + s]!, frames[span + s + 1]!, local));
}
