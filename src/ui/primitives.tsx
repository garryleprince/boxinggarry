import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';

/** Small presentational primitives shared by every screen. */

type ButtonVariant = 'primary' | 'ghost' | 'quiet' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  hero?: boolean;
  block?: boolean;
  small?: boolean;
}

export function Button({
  variant = 'ghost',
  hero,
  block,
  small,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    hero ? 'btn--hero' : '',
    block ? 'btn--block' : '',
    small ? 'btn--sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
  as: As = 'div',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={`card ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function TapCard({
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type="button" className={`card card--tap ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone = 'neutral',
  color,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'signal';
  color?: string;
}) {
  return (
    <span
      className={`pill ${tone === 'signal' ? 'pill--signal' : ''}`}
      {...(color ? { style: { color, borderColor: 'transparent' } } : {})}
    >
      {children}
    </span>
  );
}

export function Meter({
  label,
  value,
  max = 100,
  suffix = '%',
  color = 'var(--signal)',
  caption,
}: {
  label: string;
  value: number;
  max?: number;
  suffix?: string;
  color?: string;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      <div className="meter__head">
        <span className="muted">{label}</span>
        <span className="num" style={{ fontWeight: 700 }}>
          {Math.round(value)}
          {suffix}
        </span>
      </div>
      <div
        className="bar"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div className="bar__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {caption ? <span className="micro dim">{caption}</span> : null}
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <div className="stat__value num">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

export function Choice({
  title,
  sub,
  selected,
  onSelect,
  disabled,
}: {
  title: string;
  sub?: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="choice"
      aria-pressed={selected}
      onClick={onSelect}
      disabled={disabled}
    >
      <span style={{ display: 'grid', gap: 2 }}>
        <span className="choice__title">{title}</span>
        {sub ? <span className="choice__sub">{sub}</span> : null}
      </span>
      {selected ? (
        <span className="choice__check" aria-hidden>
          ✓
        </span>
      ) : null}
    </button>
  );
}

export function Chip({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label={`${label} : diminuer`}
      >
        −
      </button>
      <div className="stepper__value num" aria-live="polite">
        {format ? format(value) : value}
      </div>
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label={`${label} : augmenter`}
      >
        +
      </button>
    </div>
  );
}

/** Bottom sheet. Closes on backdrop tap and on Escape. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      {...(title ? { 'aria-label': title } : {})}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" aria-hidden />
        {title ? (
          <h2 className="screen-title" style={{ fontSize: 'var(--t-title)', marginBottom: 'var(--s-4)' }}>
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Banner({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warn' | 'danger';
}) {
  return <div className={`banner ${tone === 'neutral' ? '' : `banner--${tone}`}`}>{children}</div>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <p style={{ fontWeight: 600, color: 'var(--text-2)' }}>{title}</p>
      {hint ? (
        <p className="small" style={{ marginTop: 6 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}
