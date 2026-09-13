import type { ReactNode } from 'react';
import { back } from '@/app/router';
import { IconBack } from './icons';

/** Screen header with an optional back affordance and trailing slot. */
export function Header({
  eyebrow,
  title,
  trailing,
  onBack,
  backTo,
}: {
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
  onBack?: () => void;
  backTo?: string;
}) {
  const showBack = onBack != null || backTo != null;
  return (
    <header className="screen-head">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minWidth: 0 }}>
        {showBack ? (
          <button
            type="button"
            className="btn btn--quiet"
            style={{ minHeight: 36, padding: 0, width: 36, marginLeft: -8 }}
            onClick={() => (onBack ? onBack() : back(backTo))}
            aria-label="Retour"
          >
            <IconBack />
          </button>
        ) : null}
        <div style={{ minWidth: 0 }}>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h1 className="screen-title">{title}</h1>
        </div>
      </div>
      {trailing}
    </header>
  );
}
