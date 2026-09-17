/**
 * Canonical skeleton: proportions, kinematics and pose normalisation.
 *
 * Poses are authored as raw joint coordinates, which is fast to write but says
 * nothing about anatomy: nothing stops the same forearm measuring 4 units in
 * one drawing and 16 in another, or a figure having one thigh longer than the
 * other, or a push-up hovering fourteen units above the floor.
 *
 * So the authored coordinates are treated as *intent* — they fix the angle of
 * every joint, which is what a movement actually is — and the figure itself is
 * rebuilt from those angles over one fixed set of anatomically-proportioned
 * bones. The movement survives untouched; the body stops changing shape between
 * exercises.
 *
 * Nothing here runs per frame: the whole library is normalised once at module
 * load (a few hundred microseconds) and the result is what every screen draws.
 */

export type Pt = readonly [number, number];

export interface Pose {
  readonly head: Pt;
  readonly neck: Pt;
  readonly hip: Pt;
  readonly shoulderL: Pt;
  readonly elbowL: Pt;
  readonly handL: Pt;
  readonly shoulderR: Pt;
  readonly elbowR: Pt;
  readonly handR: Pt;
  readonly kneeL: Pt;
  readonly footL: Pt;
  readonly kneeR: Pt;
  readonly footR: Pt;
}

export type Joint = keyof Pose;

export const JOINT_ORDER = [
  'head',
  'neck',
  'hip',
  'shoulderL',
  'elbowL',
  'handL',
  'shoulderR',
  'elbowR',
  'handR',
  'kneeL',
  'footL',
  'kneeR',
  'footR',
] as const;

/**
 * Bones drawn between joints, back to front.
 *
 * Each limb bone carries which limb it belongs to rather than a fixed drawing
 * weight, because which side should be drawn forward depends on the movement:
 * the old table left the whole left side greyed out, so on a mountain climber
 * or a shoulder tap the limb doing the work was the faded one.
 */
export type BonePart = 'core' | 'armL' | 'armR' | 'legL' | 'legR';

export const BONES: readonly (readonly [Joint, Joint, BonePart])[] = [
  ['neck', 'hip', 'core'],
  ['shoulderL', 'elbowL', 'armL'],
  ['elbowL', 'handL', 'armL'],
  ['hip', 'kneeL', 'legL'],
  ['kneeL', 'footL', 'legL'],
  ['neck', 'shoulderR', 'core'],
  ['shoulderR', 'elbowR', 'armR'],
  ['elbowR', 'handR', 'armR'],
  ['hip', 'kneeR', 'legR'],
  ['kneeR', 'footR', 'legR'],
  ['neck', 'shoulderL', 'core'],
];

/** The floor. Feet rest here; the drawn ground line sits just below it. */
export const GROUND = 96;

/**
 * Bone lengths, as fractions of standing height, from standard anthropometric
 * segment ratios (Drillis & Contini). `SCALE` then sizes the figure so that its
 * most extended pose — a full overhead reach — still fits the drawing frame;
 * it is derived by `tools/analyse-poses.mjs`, not guessed.
 */
const H = 90.6;
const SCALE = 0.9;

export const BONE_LENGTH = {
  trunk: 0.288 * H * SCALE,
  neck: 0.117 * H * SCALE,
  clavicle: 0.05 * H * SCALE,
  upperArm: 0.186 * H * SCALE,
  foreArm: 0.16 * H * SCALE,
  thigh: 0.245 * H * SCALE,
  shin: 0.246 * H * SCALE,
} as const;

type BoneName =
  | 'trunk'
  | 'neckBone'
  | 'clavL'
  | 'clavR'
  | 'upperL'
  | 'foreL'
  | 'upperR'
  | 'foreR'
  | 'thighL'
  | 'shinL'
  | 'thighR'
  | 'shinR';

interface BoneDef {
  readonly name: BoneName;
  readonly from: Joint;
  readonly to: Joint;
  /** Angles are stored relative to this bone, so joints rotate with their limb. */
  readonly parent: BoneName | null;
  readonly length: number;
}

/**
 * Parents run before children, so forward kinematics is a single pass.
 *
 * Angles are parent-relative on purpose: an elbow measured against its own
 * upper arm is a flexion angle, and interpolating flexion is how a real arm
 * moves. Measured against the world it would be a direction, and interpolating
 * directions makes limbs swing through positions the joint cannot reach.
 */
const SKELETON: readonly BoneDef[] = [
  { name: 'trunk', from: 'hip', to: 'neck', parent: null, length: BONE_LENGTH.trunk },
  { name: 'neckBone', from: 'neck', to: 'head', parent: 'trunk', length: BONE_LENGTH.neck },
  { name: 'clavL', from: 'neck', to: 'shoulderL', parent: 'trunk', length: BONE_LENGTH.clavicle },
  { name: 'clavR', from: 'neck', to: 'shoulderR', parent: 'trunk', length: BONE_LENGTH.clavicle },
  { name: 'upperL', from: 'shoulderL', to: 'elbowL', parent: 'trunk', length: BONE_LENGTH.upperArm },
  { name: 'foreL', from: 'elbowL', to: 'handL', parent: 'upperL', length: BONE_LENGTH.foreArm },
  { name: 'upperR', from: 'shoulderR', to: 'elbowR', parent: 'trunk', length: BONE_LENGTH.upperArm },
  { name: 'foreR', from: 'elbowR', to: 'handR', parent: 'upperR', length: BONE_LENGTH.foreArm },
  { name: 'thighL', from: 'hip', to: 'kneeL', parent: 'trunk', length: BONE_LENGTH.thigh },
  { name: 'shinL', from: 'kneeL', to: 'footL', parent: 'thighL', length: BONE_LENGTH.shin },
  { name: 'thighR', from: 'hip', to: 'kneeR', parent: 'trunk', length: BONE_LENGTH.thigh },
  { name: 'shinR', from: 'kneeR', to: 'footR', parent: 'thighR', length: BONE_LENGTH.shin },
];

/** A pose as the skeleton sees it: where the hips are, and how every joint is bent. */
export interface Rig {
  readonly root: Pt;
  /** Parent-relative bone angles in radians, in `SKELETON` order. */
  readonly angles: readonly number[];
}

const TAU = Math.PI * 2;

export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Wrap to (-π, π]: the short way round, so a joint never spins the long way. */
function wrap(a: number): number {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
}

/** Read the joint angles out of an authored pose. Lengths are discarded. */
export function toRig(pose: Pose): Rig {
  const world = new Map<BoneName, number>();
  const angles: number[] = [];
  for (const bone of SKELETON) {
    const from = pose[bone.from];
    const to = pose[bone.to];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    // A zero-length bone in the source keeps its parent's direction.
    const w = dx === 0 && dy === 0 ? (bone.parent ? (world.get(bone.parent) ?? 0) : 0) : Math.atan2(dy, dx);
    world.set(bone.name, w);
    angles.push(wrap(w - (bone.parent ? (world.get(bone.parent) ?? 0) : 0)));
  }
  return { root: pose.hip, angles };
}

/** Build the figure back up from the hips outwards, over canonical bones. */
export function toPose(rig: Rig): Pose {
  const world = new Map<BoneName, number>();
  const joints = new Map<Joint, Pt>([['hip', rig.root]]);
  SKELETON.forEach((bone, i) => {
    const w = (bone.parent ? (world.get(bone.parent) ?? 0) : 0) + (rig.angles[i] ?? 0);
    world.set(bone.name, w);
    const from = joints.get(bone.from) ?? rig.root;
    joints.set(bone.to, [from[0] + Math.cos(w) * bone.length, from[1] + Math.sin(w) * bone.length]);
  });
  const out = {} as Record<Joint, Pt>;
  for (const j of JOINT_ORDER) out[j] = joints.get(j) ?? rig.root;
  return out as Pose;
}

/** Interpolate two rigs: hips travel in a straight line, joints rotate. */
export function lerpRig(a: Rig, b: Rig, t: number): Rig {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const angles = a.angles.map((from, i) => from + wrap((b.angles[i] ?? from) - from) * k);
  return {
    root: [
      a.root[0] + (b.root[0] - a.root[0]) * k,
      a.root[1] + (b.root[1] - a.root[1]) * k,
    ],
    angles,
  };
}

/** How far the figure travels between two rigs — used to time the animation. */
export function rigDistance(a: Rig, b: Rig): number {
  let total = dist(a.root, b.root) * 0.6;
  SKELETON.forEach((bone, i) => {
    total += Math.abs(wrap((b.angles[i] ?? 0) - (a.angles[i] ?? 0))) * bone.length;
  });
  return total;
}

const TRUNK_JOINTS: readonly Joint[] = ['head', 'neck', 'hip', 'shoulderL', 'shoulderR'];

/**
 * How high the body is carried — the part that rises and falls under load.
 *
 * Averaging every joint would not do: hands and feet are pinned to the floor
 * through most exercises, so they flatten the very signal wanted. The trunk is
 * what a repetition lowers and lifts.
 */
export function trunkHeight(pose: Pose): number {
  let sum = 0;
  for (const j of TRUNK_JOINTS) sum += pose[j][1];
  return sum / TRUNK_JOINTS.length;
}

function translate(pose: Pose, dx: number, dy: number): Pose {
  const out = {} as Record<Joint, Pt>;
  for (const j of JOINT_ORDER) out[j] = [pose[j][0] + dx, pose[j][1] + dy];
  return out as Pose;
}

/* ------------------------------------------------------------------ contact */

/** Two-bone limbs whose far end can be planted on the floor. */
const LIMBS = [
  { root: 'shoulderL', mid: 'elbowL', tip: 'handL', a: BONE_LENGTH.upperArm, b: BONE_LENGTH.foreArm },
  { root: 'shoulderR', mid: 'elbowR', tip: 'handR', a: BONE_LENGTH.upperArm, b: BONE_LENGTH.foreArm },
  { root: 'hip', mid: 'kneeL', tip: 'footL', a: BONE_LENGTH.thigh, b: BONE_LENGTH.shin },
  { root: 'hip', mid: 'kneeR', tip: 'footR', a: BONE_LENGTH.thigh, b: BONE_LENGTH.shin },
] as const satisfies readonly { root: Joint; mid: Joint; tip: Joint; a: number; b: number }[];

/**
 * Two-bone inverse kinematics: put the tip on the target, keeping the joint
 * bending the way the author drew it. Out-of-reach targets straighten the limb
 * and fall short rather than stretching a bone.
 */
function solveLimb(root: Pt, target: Pt, bendSign: number, a: number, b: number): { mid: Pt; tip: Pt } {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const raw = Math.hypot(dx, dy);
  const min = Math.abs(a - b) + 0.01;
  const max = a + b - 0.01;
  const d = raw < min ? min : raw > max ? max : raw;
  const ux = raw < 1e-6 ? 1 : dx / raw;
  const uy = raw < 1e-6 ? 0 : dy / raw;
  const along = (a * a - b * b + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, a * a - along * along)) * (bendSign >= 0 ? 1 : -1);
  const mid: Pt = [root[0] + ux * along - uy * off, root[1] + uy * along + ux * off];
  const tip: Pt = [root[0] + ux * d, root[1] + uy * d];
  return { mid, tip };
}

const bendSign = (root: Pt, mid: Pt, tip: Pt): number => {
  const cross = (tip[0] - root[0]) * (mid[1] - root[1]) - (tip[1] - root[1]) * (mid[0] - root[0]);
  return cross >= 0 ? 1 : -1;
};

/** The body's supports: what a drawing puts on the floor to hold the pose up. */
const SUPPORTS = new Set<Joint>(['handL', 'handR', 'footL', 'footR']);

/**
 * Which joints the author put on the floor.
 *
 * Anything sitting at the drawing's lowest point is touching it. When that
 * lowest point is a hand or a foot the figure is standing on its supports, and
 * the other supports get a wider band: a pike push-up drawn with the hands a
 * few units above the heels still has all four planted. When it is not — a
 * superman lies on its hips with hands and feet deliberately lifted — the band
 * stays tight, or lifted limbs would be dragged back down to the floor.
 *
 * Reading this off the artwork keeps the contact set following the pose rather
 * than a table that drifts out of date as poses are edited.
 */
export function contactsOf(pose: Pose): readonly Joint[] {
  const lowest = Math.max(...JOINT_ORDER.map((j) => pose[j][1]));
  const standing = JOINT_ORDER.some((j) => SUPPORTS.has(j) && lowest - pose[j][1] <= 0.5);
  return JOINT_ORDER.filter(
    (j) => lowest - pose[j][1] <= (standing && SUPPORTS.has(j) ? 6 : 2.5),
  );
}

/**
 * Where the figure is not standing on the ground.
 *
 * Jumps have to hang in the air or they stop being jumps, and a pull-up hangs
 * from a bar: both are anchored by height rather than by contact, so the
 * movement keeps its travel. Everything else is planted.
 */
export type Anchor =
  | { readonly kind: 'ground' }
  | { readonly kind: 'air'; readonly lift: number }
  | { readonly kind: 'hands'; readonly y: number };

/**
 * Height of the bar. Chosen so a full hang leaves the feet just clear of the
 * floor; both pull-up poses share it, so the bar stays put while the body
 * travels: measured, not guessed — `npm run figures` shows the result.
 */
const BAR_Y = 3;

export const ANCHORS: Readonly<Record<string, Anchor>> = {
  jumpAir: { kind: 'air', lift: 6 },
  broadJump: { kind: 'air', lift: 7 },
  // A heel raise is the whole body rising off a foot the skeleton draws as a
  // single point. Planting it would delete the only movement the exercise has.
  calfUp: { kind: 'air', lift: 6 },
  hang: { kind: 'hands', y: BAR_Y },
  pullTop: { kind: 'hands', y: BAR_Y },
};

/**
 * Plant a rebuilt figure on the floor.
 *
 * A plank whose hands and feet sit at different heights is the most visible
 * flaw in the old drawings, and no single translation fixes it: the supporting
 * limbs have to reach. So the height is chosen by scoring the whole range —
 * how far the contacts still are from the floor, how far anything has sunk
 * through it, and how much the reaching distorted the drawn pose — and the
 * supporting limbs are then solved onto the floor at that height. Scoring the
 * distortion is what stops a squat being straightened into a stand: the drawn
 * bend is cheap to keep and expensive to undo.
 */
function planted(pose: Pose, contacts: readonly Joint[], anchor: Anchor): Pose {
  const lowest = Math.max(...JOINT_ORDER.map((j) => pose[j][1]));

  if (anchor.kind === 'air') return translate(pose, 0, GROUND - anchor.lift - lowest);
  if (anchor.kind === 'hands') {
    return translate(pose, 0, anchor.y - Math.min(pose.handL[1], pose.handR[1]));
  }

  const tips = new Set<Joint>(LIMBS.map((l) => l.tip));
  const fixed = contacts.filter((c) => !tips.has(c));
  const reaching = LIMBS.filter((l) => contacts.includes(l.tip));
  if (fixed.length === 0 && reaching.length === 0) return translate(pose, 0, GROUND - lowest);

  // Where to stand the figure: drop it until its contacts average out on the
  // floor, then let each supporting limb reach the last unit or two itself.
  //
  // The height has to come from where the drawing actually put the hands and
  // feet, never from how far the limbs could stretch. Placing them at full
  // reach looks equivalent and is not: it straightens every supporting limb,
  // so the bottom of a push-up comes out with locked elbows — identical to the
  // top, and the repetition disappears.
  const anchors: readonly Joint[] = fixed.length > 0 ? fixed : reaching.map((l) => l.tip);
  const dy = anchors.reduce((sum, j) => sum + (GROUND - pose[j][1]), 0) / anchors.length;

  const moved = translate(pose, 0, dy);
  const out = { ...moved } as Record<Joint, Pt>;
  for (const limb of reaching) {
    const root = moved[limb.root];
    const solved = solveLimb(
      root,
      [moved[limb.tip][0], GROUND],
      bendSign(root, moved[limb.mid], moved[limb.tip]),
      limb.a,
      limb.b,
    );
    out[limb.mid] = solved.mid;
    out[limb.tip] = solved.tip;
  }
  return out as Pose;
}

/* ---------------------------------------------------------------- souffle */

/**
 * Small joint deltas that read as an in-breath, in `SKELETON` order.
 *
 * Twelve exercises hold a single position — planks, the wall sit, the hollow
 * hold, the stretches — so their figure never moved at all, which on screen
 * reads as a broken image rather than as "hold this". A coach holding a plank
 * still breathes.
 *
 * Only the trunk, the head and the collarbones move. Limb angles are stored
 * against their parent, so the arms and legs ride the trunk for free, which is
 * what actually happens. Breathing them separately looked like the figure
 * coming apart: left and right limbs overlap in a side view, and any rotation
 * that is not identical on both forks them into two visible limbs.
 *
 * This works on an already-placed figure rather than on the drawing, and the
 * caller holds its supports level afterwards. Sending a breath back through
 * the whole placement pipeline put it through a hard contact threshold, where
 * a nudge of a fraction of a degree flipped the figure onto a different set of
 * supports and moved it twenty units.
 */
const BREATH_DELTAS: readonly number[] = [
  1.4, // trunk: the chest opens, and everything hanging off it follows
  -1.6, // head lifts a touch
  -0.7, // clavicles: the shoulders broaden
  0.7,
  0, // limbs stay put on purpose — see below
  0,
  0,
  0,
  0,
  0,
  0,
  0,
].map((deg) => (deg * Math.PI) / 180);

/** The same figure, one breath in. `amount` runs 0 (out) … 1 (in). */
export function breatheRig(rig: Rig, amount: number): Rig {
  return {
    root: rig.root,
    angles: rig.angles.map((a, i) => a + (BREATH_DELTAS[i] ?? 0) * amount),
  };
}

/* ---------------------------------------------------------------- appuis */

/**
 * What the figure is leaning on, hanging from or sitting against.
 *
 * Nine exercises rest on something the drawing never showed — a wall, a chair,
 * a bar — so the figure appeared to hang in mid-air or lean on nothing. The
 * geometry is derived from the pose's own joints rather than fixed, so the
 * support stays under the hands or behind the back as the movement runs.
 *
 * Deliberately absent: the pike push-up. Its two poses serve both the floor
 * version and the feet-elevated one, and drawing a box under the floor version
 * would be a lie.
 */
export type SupportKind = 'benchHands' | 'benchFeet' | 'bar' | 'wall';

export type Segment = readonly [number, number, number, number];

export function supportSegments(kind: SupportKind, pose: Pose): readonly Segment[] {
  switch (kind) {
    case 'benchHands':
    case 'benchFeet': {
      const hands = kind === 'benchHands';
      const [a, b] = hands ? [pose.handL, pose.handR] : [pose.footL, pose.footR];
      const other = hands ? (pose.footL[0] + pose.footR[0]) / 2 : (pose.handL[0] + pose.handR[0]) / 2;
      const top = Math.max(a[1], b[1]) + 2.4;
      const left = Math.min(a[0], b[0]) - 8;
      const right = Math.max(a[0], b[0]) + 8;
      // Seat, plus one leg on the side the body is not on: a box drawn around
      // both ends would swallow the legs of a bench dip.
      const foot = other > (left + right) / 2 ? left : right;
      return [
        [left, top, right, top],
        [foot, top, foot, GROUND + 2],
      ];
    }
    case 'bar': {
      const y = Math.min(pose.handL[1], pose.handR[1]) - 1.6;
      const left = Math.min(pose.handL[0], pose.handR[0]) - 11;
      const right = Math.max(pose.handL[0], pose.handR[0]) + 11;
      return [
        [left, y, right, y],
        [left, y, left, y + 5],
        [right, y, right, y + 5],
      ];
    }
    case 'wall': {
      // Behind the back, on the side the trunk leans away from.
      const x = pose.hip[0] > pose.neck[0] ? Math.max(...JOINT_ORDER.map((j) => pose[j][0])) + 4 : Math.min(...JOINT_ORDER.map((j) => pose[j][0])) - 4;
      return [[x, GROUND + 2, x, 6]];
    }
  }
}

/** Keep the figure inside the drawing frame without changing its proportions. */
function framed(pose: Pose, authored: Pose): Pose {
  const cx = JOINT_ORDER.reduce((s, j) => s + pose[j][0], 0) / JOINT_ORDER.length;
  const target = JOINT_ORDER.reduce((s, j) => s + authored[j][0], 0) / JOINT_ORDER.length;
  let dx = target - cx;
  const xs = JOINT_ORDER.map((j) => pose[j][0] + dx);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const MARGIN = 6;
  if (max - min <= 100 - 2 * MARGIN) {
    if (min < MARGIN) dx += MARGIN - min;
    else if (max > 100 - MARGIN) dx -= max - (100 - MARGIN);
  } else {
    dx += (100 - (min + max)) / 2;
  }
  return translate(pose, dx, 0);
}

/**
 * Authored drawing → drawable figure: canonical proportions, both sides of the
 * body the same length, and the supporting points actually on the floor.
 *
 * `contacts` can be supplied to pin the set rather than read it off this
 * drawing. Contact detection has a hard threshold, so a pose nudged by a
 * fraction of a degree can land on a different set and be placed somewhere
 * else entirely: anything that perturbs a pose and expects a small result —
 * breathing — must hold the set fixed.
 */
export function normalise(drawn: Pose, anchor: Anchor, contacts?: readonly Joint[]): Pose {
  return framed(planted(toPose(toRig(drawn)), contacts ?? contactsOf(drawn), anchor), drawn);
}
