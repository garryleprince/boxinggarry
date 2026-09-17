import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { BUILT_IN_PRESETS, presetDuration } from '@/data/presets';
import { formatDuration } from '@/engines/training/duration';
import { Card, Pill, TapCard } from '@/ui/primitives';
import { Figure } from '@/ui/Figure';
import { Header } from '@/ui/Header';
import { IconGlove, IconTimer } from '@/ui/icons';

/** Boxing hub: round timer and shadowboxing, plus the punch numbering key. */
export function Boxing() {
  const { core } = useStore();
  const presets = [...BUILT_IN_PRESETS, ...core.customPresets];

  return (
    <div className="screen">
      <Header eyebrow="Boxe" title="Rounds & shadow" />

      <div className="grid-2" style={{ marginBottom: 'var(--s-5)' }}>
        <TapCard onClick={() => navigate('/timer')} className="stack-sm">
          <IconTimer size={22} />
          <strong>Round timer</strong>
          <span className="micro dim">Presets et minuteur personnalisé</span>
        </TapCard>
        <TapCard onClick={() => navigate('/shadowboxing')} className="stack-sm">
          <IconGlove size={22} />
          <strong>Shadowboxing</strong>
          <span className="micro dim">Rounds guidés avec combinaisons</span>
        </TapCard>
      </div>

      <section style={{ marginBottom: 'var(--s-5)' }}>
        <h3 className="section-title">Presets</h3>
        <div className="stack-sm">
          {presets.map((preset) => (
            <button
              key={String(preset.id)}
              type="button"
              className="card card--tap row-between"
              onClick={() => navigate(`/timer?preset=${encodeURIComponent(String(preset.id))}`)}
            >
              <span>
                <strong style={{ display: 'block' }}>{preset.name}</strong>
                <span className="micro dim">
                  {preset.rounds} × {formatDuration(preset.workSec)} · repos{' '}
                  {formatDuration(preset.restSec)}
                </span>
              </span>
              <Pill>{Math.round(presetDuration(preset) / 60)} min</Pill>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-title">Numérotation</h3>
        <Card>
          <div className="row" style={{ gap: 'var(--s-4)', alignItems: 'flex-start' }}>
            <div style={{ width: 64, flexShrink: 0 }}>
              <Figure poses={['guard', 'jab', 'guard', 'cross']} size="100%" cycleSec={2.4} cadence="vif" />
            </div>
            <ul className="stack-sm small" style={{ flex: 1 }}>
              {[
                ['1', 'Jab — main avant, coup direct'],
                ['2', 'Cross — main arrière, coup direct'],
                ['3', 'Crochet avant'],
                ['4', 'Crochet arrière'],
                ['5', 'Uppercut avant'],
                ['6', 'Uppercut arrière'],
              ].map(([n, label]) => (
                <li key={n} className="row" style={{ gap: 'var(--s-3)' }}>
                  <span
                    className="num"
                    style={{
                      width: 24,
                      height: 24,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 'var(--r-full)',
                      background: 'var(--signal-dim)',
                      color: 'var(--signal-hot)',
                      fontWeight: 700,
                      fontSize: 'var(--t-micro)',
                      flexShrink: 0,
                    }}
                  >
                    {n}
                  </span>
                  <span className="muted">{label}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="micro dim" style={{ marginTop: 'var(--s-3)' }}>
            « Avant » et « arrière » désignent ta main avant et ta main arrière, quelle que soit ta
            garde.
          </p>
        </Card>
      </section>
    </div>
  );
}
