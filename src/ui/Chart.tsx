/**
 * Two small chart primitives, drawn as inline SVG.
 *
 * A charting library would be the single largest thing in the bundle for two
 * shapes; these are sober by design and inherit the theme tokens, so they read
 * correctly in both light and dark.
 */

export interface Point {
  readonly label: string;
  readonly value: number;
}

export function BarChart({
  data,
  height = 120,
  colour = 'var(--signal)',
  unit = '',
}: {
  data: readonly Point[];
  height?: number;
  colour?: string;
  unit?: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chart" style={{ height }}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="chart__col">
          <div className="chart__bar-wrap">
            <div
              className="chart__bar"
              style={{ height: `${(d.value / max) * 100}%`, background: colour }}
              title={`${d.label} : ${d.value}${unit}`}
            />
          </div>
          <span className="chart__label micro dim">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function LineChart({
  data,
  height = 130,
  colour = 'var(--signal)',
  unit = '',
}: {
  data: readonly Point[];
  height?: number;
  colour?: string;
  unit?: string;
}) {
  if (data.length < 2) return null;
  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const w = 100;
  const h = 40;
  const pad = 3;

  const pt = (v: number, i: number) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  };

  const line = data.map((d, i) => pt(d.value, i).join(',')).join(' ');
  const area = `${pad},${h} ${line} ${w - pad},${h}`;
  const last = data[data.length - 1]!;

  return (
    <figure className="chart-line" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }} preserveAspectRatio="none" aria-hidden>
        <polygon points={area} fill={colour} opacity="0.1" />
        <polyline
          points={line}
          fill="none"
          stroke={colour}
          strokeWidth="1.1"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => {
          const [x, y] = pt(d.value, i);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i === data.length - 1 ? 1.8 : 0.9}
              fill={i === data.length - 1 ? colour : 'var(--text-3)'}
            />
          );
        })}
      </svg>
      <figcaption className="row-between micro dim" style={{ marginTop: 6 }}>
        <span>{data[0]?.label}</span>
        <span>
          {last.label} · {last.value}
          {unit}
        </span>
      </figcaption>
    </figure>
  );
}
