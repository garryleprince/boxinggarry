/**
 * The figure, drawn as a wooden artist's mannequin.
 *
 * A stick figure says where the joints are; a mannequin says what the body is
 * doing. The difference is volume and articulation — a thigh that is thicker
 * than a shin, a ball at every joint, a chest and a pelvis rather than one
 * line between them, and hands and feet, which are what tell you whether a
 * heel is lifted or a fist is closed.
 *
 * Everything here is geometry: it turns a placed `Pose` into SVG path data.
 * The pose library is untouched — the mannequin is a way of drawing the same
 * thirteen joints, not a different skeleton.
 */

import { GROUND, JOINT_ORDER, type Joint, type Pose, type Pt } from '@/data/poses';

/* ----------------------------------------------------------- proportions */

/**
 * Segment thicknesses, in viewBox units. A mannequin tapers: every limb is
 * widest at the joint it hangs from, and the body is widest at the chest.
 */
const R = {
  head: 4.8,
  neck: 2.3,
  /** The chest is widest across the shoulders, not at the base of the neck. */
  chest: 5.0,
  yoke: 5.6,
  waist: 4.1,
  pelvis: 5.4,
  shoulder: 3.5,
  elbow: 2.7,
  wrist: 2.0,
  fist: 2.4,
  hip: 3.9,
  knee: 3.1,
  ankle: 2.3,
  toe: 1.9,
} as const;

/** Where the waist ball sits along the hip → neck line. */
const WAIST_ALONG = 0.46;
/** Height of the head egg, relative to its width. */
const HEAD_STRETCH = 1.18;
/** How far down the spine the shoulder yoke sits, so the neck stays visible. */
const YOKE_ALONG = 0.79;
/** How far the fist reaches past the wrist, along the forearm. */
const FIST_REACH = 0.27;
/** Half the distance between the two hip sockets, across the pelvis. */
const HIP_SPREAD = 2.3;
/** Length of the foot, and of the heel behind the ankle. */
const FOOT_LENGTH = 9.5;
const HEEL_LENGTH = 3.6;

/* -------------------------------------------------------------- vecteurs */

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const norm = (a: Pt): Pt => {
  const l = Math.hypot(a[0], a[1]);
  return l < 1e-6 ? [1, 0] : [a[0] / l, a[1] / l];
};
const lerp = (a: Pt, b: Pt, t: number): Pt => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
/** Rotate a quarter turn. In a y-down space this is clockwise on screen. */
const perp = (a: Pt): Pt => [-a[1], a[0]];

const n = (v: number): string => (Math.abs(v) < 1e-4 ? '0' : v.toFixed(2));

/* ------------------------------------------------------------- géométrie */

/**
 * The outline of two circles and everything between them: a limb that is
 * thicker at one end than the other, with its joints rounded off.
 *
 * This single shape is what makes the figure read as carved rather than
 * drawn — a stroked line is the same width from end to end, and no part of a
 * body is.
 */
export function taper(a: Pt, ra: number, b: Pt, rb: number): string {
  const axis = sub(b, a);
  const length = Math.hypot(axis[0], axis[1]);
  // One joint swallowed by the other: draw the larger ball and nothing else.
  if (length <= Math.abs(ra - rb) + 0.01) {
    const [c, r] = ra >= rb ? [a, ra] : [b, rb];
    return `M ${n(c[0] - r)} ${n(c[1])} a ${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0 Z`;
  }
  const u = norm(axis);
  const p = perp(u);
  const cos = (ra - rb) / length;
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const plus: Pt = [u[0] * cos + p[0] * sin, u[1] * cos + p[1] * sin];
  const minus: Pt = [u[0] * cos - p[0] * sin, u[1] * cos - p[1] * sin];
  const alpha = Math.acos(Math.max(-1, Math.min(1, cos)));

  const a1 = add(a, scale(plus, ra));
  const b1 = add(b, scale(plus, rb));
  const b2 = add(b, scale(minus, rb));
  const a2 = add(a, scale(minus, ra));
  // Around `b` the outline crosses the far tip (a span of 2α); around `a` it
  // takes the long way round the back (2π − 2α). Both turn the same way.
  const farLarge = 2 * alpha > Math.PI ? 1 : 0;
  const backLarge = 2 * Math.PI - 2 * alpha > Math.PI ? 1 : 0;
  return (
    `M ${n(a1[0])} ${n(a1[1])} L ${n(b1[0])} ${n(b1[1])} ` +
    `A ${n(rb)} ${n(rb)} 0 ${farLarge} 0 ${n(b2[0])} ${n(b2[1])} ` +
    `L ${n(a2[0])} ${n(a2[1])} ` +
    `A ${n(ra)} ${n(ra)} 0 ${backLarge} 0 ${n(a1[0])} ${n(a1[1])} Z`
  );
}

/** A ball joint. */
export function ball(c: Pt, r: number): string {
  return `M ${n(c[0] - r)} ${n(c[1])} a ${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0 Z`;
}

/** The head: an egg, standing along the neck rather than always upright. */
export function headEgg(pose: Pose): string {
  const up = norm(sub(pose.head, pose.neck));
  const side = perp(up);
  const rx = R.head;
  const ry = R.head * HEAD_STRETCH;
  const top = add(pose.head, scale(up, ry));
  const bottom = add(pose.head, scale(up, -ry));
  const angle = (Math.atan2(up[1], up[0]) * 180) / Math.PI - 90;
  void side;
  return (
    `M ${n(top[0])} ${n(top[1])} ` +
    `A ${n(rx)} ${n(ry)} ${n(angle)} 0 1 ${n(bottom[0])} ${n(bottom[1])} ` +
    `A ${n(rx)} ${n(ry)} ${n(angle)} 0 1 ${n(top[0])} ${n(top[1])} Z`
  );
}

/* ------------------------------------------------------- mains et pieds */

/** Wrist and fist, placed back from the drawn hand so the reach is unchanged. */
export function fistOf(pose: Pose, side: 'L' | 'R'): { wrist: Pt; fist: Pt } {
  const elbow = side === 'L' ? pose.elbowL : pose.elbowR;
  const hand = side === 'L' ? pose.handL : pose.handR;
  return { wrist: lerp(elbow, hand, 1 - FIST_REACH), fist: hand };
}

/**
 * Where the foot points.
 *
 * The library has one joint per foot, and it is the point the pose stands on,
 * so the foot has to be drawn from it rather than beyond it. Three cases, and
 * the last is what makes a plank look like a plank: lying face down with a
 * foot flat on the floor is not a plank, it is a nap.
 */
export function footOf(
  pose: Pose,
  side: 'L' | 'R',
  facing: number,
  prone: boolean,
): { heel: Pt; toe: Pt; ankle: Pt } {
  /** Swing a point up around its anchor rather than let it sink through the floor. */
  const above = (anchor: Pt, point: Pt): Pt => {
    if (point[1] <= GROUND) return point;
    const reach = Math.hypot(point[0] - anchor[0], point[1] - anchor[1]);
    const drop = GROUND - anchor[1];
    if (reach < 1e-6) return point;
    if (Math.abs(drop) >= reach) return [anchor[0] + Math.sign(point[0] - anchor[0]) * reach, anchor[1]];
    const run = Math.sqrt(reach * reach - drop * drop);
    return [anchor[0] + Math.sign(point[0] - anchor[0] || 1) * run, GROUND];
  };
  const knee = side === 'L' ? pose.kneeL : pose.kneeR;
  const ankle = side === 'L' ? pose.footL : pose.footR;
  const down = norm(sub(ankle, knee));
  const planted = ankle[1] > GROUND - 2.5;

  if (prone && planted) {
    // On the toes: the drawn joint is the ball of the foot, and the heel lifts
    // back up the shin.
    const back = norm([-facing, -0.85]);
    return { ankle: add(ankle, scale(back, HEEL_LENGTH)), heel: add(ankle, scale(back, FOOT_LENGTH)), toe: ankle };
  }
  if (planted) {
    // Flat on the floor, toes pointing the way the body faces.
    const along: Pt = [facing, 0];
    return {
      ankle,
      heel: add(ankle, scale(along, -HEEL_LENGTH)),
      toe: add(ankle, scale(along, FOOT_LENGTH)),
    };
  }
  // In the air: the toe follows the shin, the heel trails behind it. Even off
  // the ground a foot can point at the floor, so both ends are swung clear.
  const along = norm(add(scale(down, 0.55), [facing * 0.85, 0]));
  return {
    ankle,
    heel: above(ankle, add(ankle, scale(down, -HEEL_LENGTH * 0.4))),
    toe: above(ankle, add(ankle, scale(along, FOOT_LENGTH * 0.85))),
  };
}

/**
 * Which way the body faces, read off the pose.
 *
 * Lying down, it faces along its own spine. Standing, the drawings are frontal
 * and the feet splay outwards, so each foot turns away from the middle.
 */
export function facingOf(pose: Pose): { prone: boolean; left: number; right: number } {
  const spine = sub(pose.neck, pose.hip);
  const prone = Math.abs(spine[0]) > Math.abs(spine[1]);
  if (prone) {
    const way = Math.sign(spine[0]) || 1;
    return { prone, left: way, right: way };
  }
  const middle = JOINT_ORDER.reduce((sum, j: Joint) => sum + pose[j][0], 0) / JOINT_ORDER.length;
  return {
    prone,
    left: Math.sign(pose.footL[0] - middle) || -1,
    right: Math.sign(pose.footR[0] - middle) || 1,
  };
}

/* ---------------------------------------------------------------- pièces */

export type PartName = 'pelvis' | 'chest' | 'neck' | 'armL' | 'armR' | 'legL' | 'legR';

export interface Piece {
  readonly part: PartName;
  readonly d: string;
  /** Joints get a seam drawn over them, which is what reads as a ball joint. */
  readonly seam?: boolean;
}

/** Every shape the mannequin is made of, back to front. */
export function pieces(pose: Pose): readonly Piece[] {
  const waist = lerp(pose.hip, pose.neck, WAIST_ALONG);
  const yoke = lerp(pose.hip, pose.neck, YOKE_ALONG);
  const across = perp(norm(sub(pose.neck, pose.hip)));
  const { prone, left, right } = facingOf(pose);
  const out: Piece[] = [];

  const limb = (
    part: PartName,
    side: 'L' | 'R',
    kind: 'arm' | 'leg',
  ): void => {
    if (kind === 'arm') {
      const shoulder = side === 'L' ? pose.shoulderL : pose.shoulderR;
      const elbow = side === 'L' ? pose.elbowL : pose.elbowR;
      const { wrist, fist } = fistOf(pose, side);
      // The yoke carries the arm back to the spine: a ball floating beside the
      // chest reads as a detached limb, however well the arm itself is drawn.
      out.push({ part, d: taper(yoke, R.yoke * 0.8, shoulder, R.shoulder) });
      out.push({ part, d: taper(shoulder, R.shoulder, elbow, R.elbow) });
      out.push({ part, d: taper(elbow, R.elbow, wrist, R.wrist) });
      out.push({ part, d: taper(wrist, R.wrist, fist, R.fist) });
      out.push({ part, d: ball(shoulder, R.shoulder * 0.62), seam: true });
      out.push({ part, d: ball(elbow, R.elbow * 0.66), seam: true });
      return;
    }
    const knee = side === 'L' ? pose.kneeL : pose.kneeR;
    const { ankle, heel, toe } = footOf(pose, side, side === 'L' ? left : right, prone);
    // Both thighs hang off one drawn joint, so the sockets are set apart across
    // the pelvis: legs sprouting from a single point read as a hinge, not hips.
    const socket = add(pose.hip, scale(across, side === 'L' ? -HIP_SPREAD : HIP_SPREAD));
    out.push({ part, d: taper(socket, R.hip, knee, R.knee) });
    out.push({ part, d: taper(knee, R.knee, ankle, R.ankle) });
    out.push({ part, d: taper(heel, R.toe, toe, R.toe * 1.15) });
    out.push({ part, d: ball(knee, R.knee * 0.66), seam: true });
  };

  limb('legL', 'L', 'leg');
  limb('armL', 'L', 'arm');
  out.push({ part: 'pelvis', d: taper(pose.hip, R.pelvis, waist, R.waist) });
  out.push({ part: 'chest', d: taper(waist, R.waist, yoke, R.chest) });
  out.push({ part: 'chest', d: ball(waist, R.waist * 0.72), seam: true });
  out.push({ part: 'neck', d: taper(pose.neck, R.neck, pose.head, R.neck * 0.85) });
  limb('legR', 'R', 'leg');
  limb('armR', 'R', 'arm');
  return out;
}
