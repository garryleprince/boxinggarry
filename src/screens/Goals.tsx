import { useState } from 'react';
import { useStore } from '@/app/store';
import { GOALS, GOAL_META, type Goal, type IntensityPreference } from '@/domain/model/user';
import { archetypeScores } from '@/engines/training/plan';
import { ARCHETYPE_META, ARCHETYPES } from '@/domain/model/workout';
import { Button, Card, Choice, Stepper } from '@/ui/primitives';
import { Header } from '@/ui/Header';

/**
 * Goals (cahier des charges §11).
 *
 * The screen shows what changing a goal actually does: the weekly mix updates
 * live, so the choice is never an abstract preference.
 */
export function Goals() {
  const { core } = useStore();
  const saveProfile = useStore((s) => s.saveProfile);
  const profile = core.profile;
  const [goals, setGoals] = useState<Goal[]>(profile?.goals ? [...profile.goals] : []);
  const [frequency, setFrequency] = useState(profile?.weeklyFrequency ?? 4);
  const [intensity, setIntensity] = useState<IntensityPreference>(
    profile?.intensity ?? 'equilibree',
  );
  const [saved, setSaved] = useState(false);

  if (!profile) return null;

  const scores = archetypeScores(goals);
  const ranked = [...ARCHETYPES]
    .filter((a) => a !== 'recovery')
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  const max = Math.max(1, ...Object.values(scores));

  const dirty =
    JSON.stringify(goals) !== JSON.stringify(profile.goals) ||
    frequency !== profile.weeklyFrequency ||
    intensity !== profile.intensity;

  return (
    <div className="screen">
      <Header eyebrow="Programmation" title="Objectifs" backTo="/plus" />

      <p className="muted small" style={{ marginBottom: 'var(--s-4)' }}>
        Un à trois objectifs. Ils déterminent la composition de ta semaine et le choix des exercices.
      </p>

      <div className="stack-sm" style={{ marginBottom: 'var(--s-5)' }}>
        {GOALS.map((goal) => (
          <Choice
            key={goal}
            title={GOAL_META[goal].label}
            sub={GOAL_META[goal].blurb}
            selected={goals.includes(goal)}
            onSelect={() => {
              setSaved(false);
              setGoals((current) =>
                current.includes(goal)
                  ? current.filter((g) => g !== goal)
                  : current.length >= 3
                    ? [...current.slice(1), goal]
                    : [...current, goal],
              );
            }}
          />
        ))}
      </div>

      <section style={{ marginBottom: 'var(--s-5)' }}>
        <h3 className="section-title">Ce que ça change</h3>
        <Card className="stack-sm">
          {ranked.map((archetype) => (
            <div key={archetype} className="stack-sm" style={{ gap: 4 }}>
              <div className="row-between small">
                <span>
                  {ARCHETYPE_META[archetype].emoji} {ARCHETYPE_META[archetype].label}
                </span>
                <span className="micro dim">
                  {Math.round(((scores[archetype] ?? 0) / max) * 100)}%
                </span>
              </div>
              <div className="bar">
                <div
                  className="bar__fill"
                  style={{ width: `${((scores[archetype] ?? 0) / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
          <p className="micro dim">
            Plus une barre est haute, plus ce type de séance revient souvent dans ta semaine.
          </p>
        </Card>
      </section>

      <section style={{ marginBottom: 'var(--s-5)' }}>
        <h3 className="section-title">Fréquence</h3>
        <Card>
          <Stepper
            label="Séances par semaine"
            value={frequency}
            min={2}
            max={6}
            onChange={(v) => {
              setFrequency(v);
              setSaved(false);
            }}
            format={(v) => `${v} séances / semaine`}
          />
        </Card>
      </section>

      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Intensité</h3>
        <div className="stack-sm">
          {(
            [
              ['progressive', 'Progressive', 'Repos plus longs, volume mesuré'],
              ['equilibree', 'Équilibrée', 'Le compromis par défaut'],
              ['exigeante', 'Exigeante', 'Densité élevée, repos courts'],
            ] as [IntensityPreference, string, string][]
          ).map(([value, title, sub]) => (
            <Choice
              key={value}
              title={title}
              sub={sub}
              selected={intensity === value}
              onSelect={() => {
                setIntensity(value);
                setSaved(false);
              }}
            />
          ))}
        </div>
      </section>

      <Button
        variant="primary"
        hero
        disabled={!dirty || goals.length === 0}
        onClick={async () => {
          await saveProfile({ ...profile, goals, weeklyFrequency: frequency, intensity });
          setSaved(true);
        }}
      >
        {saved && !dirty ? 'Enregistré' : 'Enregistrer'}
      </Button>
      {saved && !dirty ? (
        <p className="micro dim" style={{ textAlign: 'center', marginTop: 'var(--s-3)' }}>
          Ton programme est déjà mis à jour.
        </p>
      ) : null}
    </div>
  );
}
