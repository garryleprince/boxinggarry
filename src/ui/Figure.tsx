import { useEffect, useMemo, useRef } from 'react';
import {
  BONES,
  POSES,
  emphasisFor,
  samplePoseCycle,
  supportFor,
  type BonePart,
  type Cadence,
  type Emphasis,
  type Pose,
  type PoseKey,
} from '@/data/poses';
import { useAnimationsEnabled } from './motion';

/**
 * Animated exercise illustration.
 *
 * Draws the 13-joint skeleton and walks it through the exercise's pose
 * sequence, so the athlete sees the movement — start position, motion, end
 * position — rather than a frozen shape. Everything is inline SVG: no
 * requests, no copyright, works offline from the first launch.
 *
 * The figure is moved by writing straight to the SVG attributes on one shared
 * animation frame, not by re-rendering React sixty times a second. On a phone
 * that is the difference between a demonstration and a stutter, and it lets
 * several figures on one screen share a single timer.
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

const HEAD_RADIUS = 6.6;
const NEAR_WIDTH = 4.2;
const FAR_WIDTH = 3.4;
const FAR_OPACITY = 0.55;

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

/** How far forward a limb is drawn: 0 fully behind, 1 fully in front. */
function prominence(part: BonePart, emphasis: Emphasis): number {
  switch (part) {
    case 'armL':
      return (1 - emphasis.arms) / 2;
    case 'armR':
      return (1 + emphasis.arms) / 2;
    case 'legL':
      return (1 - emphasis.legs) / 2;
    case 'legR':
      return (1 + emphasis.legs) / 2;
    default:
      return 1;
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
  const shownEmphasis = emphasisFor(keys, shown);
  const support = supportFor(keys);

  const behind = useRef<(SVGLineElement | null)[]>([]);
  const front = useRef<(SVGLineElement | null)[]>([]);
  const head = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    if (frozen) return;
    const period =
      keys.length < 2 ? BREATH_SEC : Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, cycleSec));
    const start = performance.now();

    const draw = (pose: Pose) => {
      const emphasis = emphasisFor(keys, pose);
      BONES.forEach(([a, b, part], i) => {
        const coords = [pose[a][0], pose[a][1], pose[b][0], pose[b][1]];
        const forward = front.current[i];
        const back = behind.current[i];
        for (const el of [forward, back]) {
          if (!el) continue;
          el.setAttribute('x1', coords[0]!.toFixed(2));
          el.setAttribute('y1', coords[1]!.toFixed(2));
          el.setAttribute('x2', coords[2]!.toFixed(2));
          el.setAttribute('y2', coords[3]!.toFixed(2));
        }
        if (forward && back) {
          // Crossfade rather than switch: the working side comes forward as the
          // movement reaches it, with nothing popping on the way.
          const p = prominence(part, emphasis);
          forward.setAttribute('opacity', p.toFixed(3));
          back.setAttribute('opacity', (FAR_OPACITY * (1 - p)).toFixed(3));
        }
      });
      if (head.current) {
        head.current.setAttribute('cx', pose.head[0].toFixed(2));
        head.current.setAttribute('cy', pose.head[1].toFixed(2));
      }
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
      {ghost
        ? BONES.map(([a, b, part], i) => (
            <line
              key={`ghost-${i}`}
              x1={ghost[a][0]}
              y1={ghost[a][1]}
              x2={ghost[b][0]}
              y2={ghost[b][1]}
              stroke="var(--text-3)"
              strokeWidth={part === 'core' ? 5 : 4}
              strokeLinecap="round"
              opacity={0.28}
            />
          ))
        : null}
      {ghost ? (
        <circle
          cx={ghost.head[0]}
          cy={ghost.head[1]}
          r={HEAD_RADIUS}
          fill="var(--text-3)"
          opacity={0.28}
        />
      ) : null}
      {/* Every limb is drawn twice — set back, then forward — and the two are
          crossfaded so the side doing the work is the one you see. */}
      {BONES.map(([a, b, part], i) =>
        part === 'core' ? null : (
          <line
            key={`behind-${i}`}
            ref={(el) => {
              behind.current[i] = el;
            }}
            x1={shown[a][0]}
            y1={shown[a][1]}
            x2={shown[b][0]}
            y2={shown[b][1]}
            stroke="var(--text-3)"
            strokeWidth={FAR_WIDTH}
            strokeLinecap="round"
            opacity={FAR_OPACITY * (1 - prominence(part, shownEmphasis))}
          />
        ),
      )}
      {BONES.map(([a, b, part], i) => (
        <line
          key={`front-${i}`}
          ref={(el) => {
            front.current[i] = el;
          }}
          x1={shown[a][0]}
          y1={shown[a][1]}
          x2={shown[b][0]}
          y2={shown[b][1]}
          stroke="var(--text-1)"
          strokeWidth={part === 'core' ? 5 : NEAR_WIDTH}
          strokeLinecap="round"
          opacity={part === 'core' ? 1 : prominence(part, shownEmphasis)}
        />
      ))}
      <circle
        ref={head}
        cx={shown.head[0]}
        cy={shown.head[1]}
        r={HEAD_RADIUS}
        fill="var(--signal)"
        stroke="var(--ink-0)"
        strokeWidth="1.2"
      />
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
