import { Figure } from '@/ui/Figure';

/** Shown while the vault is being opened. Deliberately quiet and brief. */
export function Splash({ message = 'Ouverture…' }: { message?: string }) {
  return (
    <div className="splash">
      <div className="splash__mark">
        <Figure poses={['guard', 'jab']} cycleSec={1.6} size={110} />
      </div>
      <div className="splash__name">
        Boxing<span style={{ color: 'var(--signal)' }}>·</span>Body Coach
      </div>
      <div className="micro dim">{message}</div>
    </div>
  );
}
