import { useEffect, useMemo, useRef } from 'react';
import { BONES, POSES, samplePoseCycle, type Pose, type PoseKey } from '@/data/poses';
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
const MIN_CYCLE = 1.3;
const MAX_CYCLE = 4.5;
const DEFAULT_CYCLE = 2.6;

export interface FigureProps {
  poses: readonly PoseKey[];
  /** Seconds for one complete repetition. Clamped to a watchable range. */
  cycleSec?: number;
  /** Freeze on the movement's end position — for reduced motion or thumbnails. */
  still?: boolean;
  size?: number | string;
  className?: string;
  /** Accessible description; the figure is decorative without it. */
  label?: string;
}

const HEAD_RADIUS = 6.6;

export function Figure({
  poses,
  cycleSec = DEFAULT_CYCLE,
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

  const lines = useRef<(SVGLineElement | null)[]>([]);
  const head = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    if (frozen || keys.length < 2) return;
    const period = Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, cycleSec));
    const start = performance.now();

    const draw = (pose: Pose) => {
      BONES.forEach(([a, b], i) => {
        const el = lines.current[i];
        if (!el) return;
        el.setAttribute('x1', pose[a][0].toFixed(2));
        el.setAttribute('y1', pose[a][1].toFixed(2));
        el.setAttribute('x2', pose[b][0].toFixed(2));
        el.setAttribute('y2', pose[b][1].toFixed(2));
      });
      if (head.current) {
        head.current.setAttribute('cx', pose.head[0].toFixed(2));
        head.current.setAttribute('cy', pose.head[1].toFixed(2));
      }
    };

    const stop = subscribe((now) => draw(samplePoseCycle(keys, ((now - start) / 1000 / period) % 1)));
    draw(samplePoseCycle(keys, 0));
    return stop;
  }, [keys, cycleSec, frozen]);

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
      {ghost
        ? BONES.map(([a, b, weight], i) => (
            <line
              key={`ghost-${i}`}
              x1={ghost[a][0]}
              y1={ghost[a][1]}
              x2={ghost[b][0]}
              y2={ghost[b][1]}
              stroke="var(--text-3)"
              strokeWidth={weight === 'core' ? 5 : 4}
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
      {BONES.map(([a, b, weight], i) => (
        <line
          key={i}
          ref={(el) => {
            lines.current[i] = el;
          }}
          x1={shown[a][0]}
          y1={shown[a][1]}
          x2={shown[b][0]}
          y2={shown[b][1]}
          stroke={weight === 'far' ? 'var(--text-3)' : 'var(--text-1)'}
          strokeWidth={weight === 'core' ? 5 : weight === 'near' ? 4.2 : 3.4}
          strokeLinecap="round"
          opacity={weight === 'far' ? 0.55 : 1}
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
