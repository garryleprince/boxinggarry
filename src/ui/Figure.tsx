import { useEffect, useMemo, useRef } from 'react';
import {
  POSES,
  emphasisFor,
  samplePoseCycle,
  supportFor,
  type Cadence,
  type Emphasis,
  type Pose,
  type PoseKey,
} from '@/data/poses';
import { headEgg, pieces, type PartName } from './mannequin';
import { useAnimationsEnabled } from './motion';

/**
 * Animated exercise illustration: a wooden artist's mannequin.
 *
 * Walks the figure through the exercise's pose sequence, so the athlete sees
 * the movement — start position, motion, end position — rather than a frozen
 * shape. Everything is inline SVG: no requests, no copyright, works offline
 * from the first launch.
 *
 * The figure is moved by writing straight to the SVG path data on one shared
 * animation frame, not by re-rendering React sixty times a second. Which limb
 * is in front is a class, not a colour written per frame, so the shading fades
 * across without costing anything.
 *
 * When an exercise carries a `media` asset, callers render that instead; this
 * component is the default and the fallback.
 */

type Tick = (now: number) => void;

const subscribers = new Set<Tick>();
let frame = 0;

function pump(now: number) {
  frame = requestAnimationFrame(pump);
  for (const tick of subscribers) tick(now);
}

/** One timer for every figure on screen; it stops when the last one unmounts. */
function subscribe(tick: Tick): () => void {
  subscribers.add(tick);
  if (!frame) frame = requestAnimationFrame(pump);
  return () => {
    subscribers.delete(tick);
    if (subscribers.size === 0 && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/** Sensible bounds for a demonstration, whatever tempo the exercise prescribes. */
const MIN_CYCLE = 1.2;
const MAX_CYCLE = 6;
const DEFAULT_CYCLE = 2.6;
/** A held position breathes on its own clock, not the exercise's tempo. */
const BREATH_SEC = 4.6;

export interface FigureProps {
  poses: readonly PoseKey[];
  /** Seconds for one complete repetition. Clamped to a watchable range. */
  cycleSec?: number;
  /** How the repetition is phrased: explosive, flowing, sharp, or plain. */
  cadence?: Cadence;
  /** Freeze on the movement's end position — for reduced motion or thumbnails. */
  still?: boolean;
  size?: number | string;
  className?: string;
  /** Accessible description; the figure is decorative without it. */
  label?: string;
}

/**
 * Whether a part is set back from the viewer.
 *
 * `emphasis` runs −1 (left side leading) to +1 (right), and its neutral value
 * is the drawing convention the library has always used: right side forward.
 * So a limb is behind whenever the emphasis leans away from it at all.
 */
function isFar(part: PartName, emphasis: Emphasis): boolean {
  switch (part) {
    case 'armL':
      return emphasis.arms > 0;
    case 'armR':
      return emphasis.arms < 0;
    case 'legL':
      return emphasis.legs > 0;
    case 'legR':
      return emphasis.legs < 0;
    default:
      return false;
  }
}

export function Figure({
  poses,
  cycleSec = DEFAULT_CYCLE,
  cadence = 'standard',
  still = false,
  size = '100%',
  className,
  label,
}: FigureProps) {
  const id = poses.join('|');
  const keys = useMemo(
    () => (poses.length > 0 ? poses : (['stand'] as const)),
    // The sequence is fixed per exercise; its identity is the joined key.
    [id],
  );
  const animationsEnabled = useAnimationsEnabled();

  // With motion off, the movement is still shown — as a ghost of the starting
  // position behind the finishing one. Freezing on a single frame would remove
  // the only thing the illustration is there to convey.
  const frozen = still || !animationsEnabled;
  const ghost = frozen && keys.length > 1 ? POSES[keys[0]!] : null;
  const shown = POSES[frozen ? keys[keys.length - 1]! : keys[0]!] ?? POSES.stand;
  const layout = useMemo(() => pieces(shown), [shown]);
  const shownEmphasis = emphasisFor(keys, shown);
  const support = supportFor(keys);

  const parts = useRef<(SVGPathElement | null)[]>([]);
  const head = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    if (frozen) return;
    const period =
      keys.length < 2 ? BREATH_SEC : Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, cycleSec));
    const start = performance.now();
    const behind = new Map<number, boolean>();

    const draw = (pose: Pose) => {
      const emphasis = emphasisFor(keys, pose);
      pieces(pose).forEach((piece, i) => {
        const el = parts.current[i];
        if (!el) return;
        el.setAttribute('d', piece.d);
        const far = isFar(piece.part, emphasis);
        if (behind.get(i) !== far) {
          behind.set(i, far);
          el.classList.toggle('is-far', far);
        }
      });
      head.current?.setAttribute('d', headEgg(pose));
    };

    const stop = subscribe((now) =>
      draw(samplePoseCycle(keys, ((now - start) / 1000 / period) % 1, cadence)),
    );
    draw(samplePoseCycle(keys, 0, cadence));
    return stop;
  }, [keys, cycleSec, cadence, frozen]);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={label ? 'img' : 'presentation'}
      {...(label ? { 'aria-label': label } : { 'aria-hidden': true })}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Ground line: gives the pose a sense of weight and orientation. */}
      <line
        x1="4"
        y1="98"
        x2="96"
        y2="98"
        stroke="var(--line)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* The wall, chair or bar the movement rests on. */}
      {support.map(([x1, y1, x2, y2], i) => (
        <line
          key={`support-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--line)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
      {ghost ? (
        <g className="mann__ghost">
          {pieces(ghost).map((piece, i) => (
            <path key={`ghost-${i}`} className={piece.seam ? 'mann__seam' : 'mann__part'} d={piece.d} />
          ))}
          <path className="mann__part" d={headEgg(ghost)} />
        </g>
      ) : null}
      {layout.map((piece, i) => (
        <path
          key={i}
          ref={(el) => {
            parts.current[i] = el;
          }}
          className={`${piece.seam ? 'mann__seam' : 'mann__part'}${
            isFar(piece.part, shownEmphasis) ? ' is-far' : ''
          }`}
          d={piece.d}
        />
      ))}
      <path ref={head} className="mann__part" d={headEgg(shown)} />
    </svg>
  );
}

/** Three stills — start, middle, end — for the exercise detail sheet. */
export function FigureSequence({ poses, label }: { poses: readonly PoseKey[]; label?: string }) {
  const keys = poses.length > 0 ? poses : (['stand'] as const);
  const captions = ['Position de départ', 'Mouvement', 'Position finale'];
  const shown =
    keys.length >= 3
      ? [keys[0]!, keys[1]!, keys[keys.length - 1]!]
      : keys.length === 2
        ? [keys[0]!, keys[1]!]
        : [keys[0]!];

  return (
    <div className="figure-seq" role="group" aria-label={label ?? 'Décomposition du mouvement'}>
      {shown.map((key, i) => (
        <figure key={`${key}-${i}`} className="figure-seq__item">
          <Figure poses={[key]} still size="100%" />
          <figcaption className="micro dim">
            {shown.length === 2 && i === 1 ? 'Position finale' : captions[i]}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
