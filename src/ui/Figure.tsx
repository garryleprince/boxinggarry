import { useEffect, useRef, useState } from 'react';
import { BONES, POSES, samplePoseCycle, type Pose, type PoseKey } from '@/data/poses';

/**
 * Animated exercise illustration.
 *
 * Draws the 13-joint skeleton and walks it through the exercise's pose
 * sequence, so the athlete sees the movement — start position, motion, end
 * position — rather than a frozen shape. Everything is inline SVG: no
 * requests, no copyright, works offline from the first launch.
 *
 * When an exercise carries a `media` asset, callers render that instead; this
 * component is the default and the fallback.
 */

export interface FigureProps {
  poses: readonly PoseKey[];
  /** Seconds for one complete out-and-back cycle. */
  cycleSec?: number;
  /** Freeze on the first pose — for reduced motion or list thumbnails. */
  still?: boolean;
  size?: number | string;
  className?: string;
  /** Accessible description; the figure is decorative without it. */
  label?: string;
}

function poseToPaths(pose: Pose) {
  return BONES.map(([a, b, weight], i) => ({
    key: `${String(a)}-${String(b)}-${i}`,
    x1: pose[a][0],
    y1: pose[a][1],
    x2: pose[b][0],
    y2: pose[b][1],
    weight,
  }));
}

export function Figure({
  poses,
  cycleSec = 2.4,
  still = false,
  size = '100%',
  className,
  label,
}: FigureProps) {
  const keys = poses.length > 0 ? poses : (['stand'] as const);
  const [pose, setPose] = useState<Pose>(() => POSES[keys[0]!] ?? POSES.stand);
  const frame = useRef(0);

  useEffect(() => {
    if (still || keys.length < 2) {
      setPose(POSES[keys[0]!] ?? POSES.stand);
      return;
    }
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setPose(POSES[keys[0]!] ?? POSES.stand);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const phase = ((now - start) / 1000 / cycleSec) % 1;
      setPose(samplePoseCycle(keys, phase));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // `keys` is derived from props and stable per exercise.
  }, [keys.join('|'), cycleSec, still]);

  const bones = poseToPaths(pose);

  return (
    <svg
      viewBox="0 0 100 104"
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
      {bones.map((b) => (
        <line
          key={b.key}
          x1={b.x1}
          y1={b.y1}
          x2={b.x2}
          y2={b.y2}
          stroke={b.weight === 'far' ? 'var(--text-3)' : 'var(--text-1)'}
          strokeWidth={b.weight === 'core' ? 5 : b.weight === 'near' ? 4.2 : 3.4}
          strokeLinecap="round"
          opacity={b.weight === 'far' ? 0.55 : 1}
        />
      ))}
      <circle
        cx={pose.head[0]}
        cy={pose.head[1]}
        r="6.6"
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
