/**
 * The countdown display.
 *
 * Readable from across a room: a very large tabular figure inside a progress
 * arc, with the phase colour carrying the state change (work, rest, prep) so
 * a glance is enough (cahier des charges §29).
 */
export function TimerRing({
  remainingSec,
  progress,
  tone,
  label,
  sublabel,
  size = 280,
}: {
  remainingSec: number;
  progress: number;
  tone: string;
  label: string;
  sublabel?: string;
  size?: number;
}) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));
  const sec = Math.max(0, Math.ceil(remainingSec));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="ring__svg" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--ink-3)" strokeWidth="4" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 120ms linear, stroke 240ms var(--ease)' }}
        />
      </svg>
      <div className="ring__content">
        <div className="ring__label" style={{ color: tone }}>
          {label}
        </div>
        <div className="ring__time mono" role="timer" aria-live="off">
          {mm}:{ss}
        </div>
        {sublabel ? <div className="ring__sub">{sublabel}</div> : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {label}, {sec} secondes restantes
      </span>
    </div>
  );
}
