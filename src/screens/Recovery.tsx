import { useMemo } from 'react';
import { useStore } from '@/app/store';
import { MUSCLE_LABELS, RECOVERY_REGIONS, REGION_LABELS } from '@/domain/model/taxonomy';
import type { MuscleGroup } from '@/domain/model/taxonomy';
import { balanceDebt, recoveryPercent, readiness, recoveryLabel } from '@/engines/recovery';
import { Banner, Card, Meter } from '@/ui/primitives';
import { Header } from '@/ui/Header';
import { REGION_COLOUR } from '@/ui/colours';

/**
 * Recovery (cahier des charges §19).
 *
 * Training estimates, stated as such. The screen explains the model rather
 * than presenting percentages as if they were measurements.
 */
export function RecoveryScreen() {
  const { core, workout } = useStore();
  const pct = useMemo(() => recoveryPercent(core.recovery), [core.recovery]);
  const ready = useMemo(() => readiness(core.recovery), [core.recovery]);
  const debt = useMemo(() => balanceDebt(core.recovery), [core.recovery]);

  const neglected = useMemo(
    () =>
      (Object.entries(debt) as [MuscleGroup, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    [debt],
  );
  const worked = useMemo(
    () =>
      (Object.entries(debt) as [MuscleGroup, number][])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 5),
    [debt],
  );

  return (
    <div className="screen">
      <Header eyebrow="État" title="Récupération" backTo="/plus" />

      <Card style={{ marginBottom: 'var(--s-5)', textAlign: 'center' }}>
        <div className="eyebrow">Disponibilité globale</div>
        <div className="num" style={{ fontSize: '3.25rem', fontWeight: 700, lineHeight: 1.05 }}>
          {ready}%
        </div>
        <p className="muted small">{recoveryLabel(ready)}</p>
      </Card>

      <section style={{ marginBottom: 'var(--s-5)' }}>
        <h3 className="section-title">Par zone</h3>
        <Card className="stack">
          {RECOVERY_REGIONS.map((region) => (
            <Meter
              key={region}
              label={REGION_LABELS[region]}
              value={pct[region]}
              color={REGION_COLOUR[region]}
              caption={recoveryLabel(pct[region])}
            />
          ))}
        </Card>
      </section>

      <Banner tone="warn">
        Ces pourcentages sont des <strong>estimations d’entraînement</strong>, calculées à partir du
        volume prescrit, de l’intensité des exercices et de ta difficulté ressentie. Ce ne sont ni
        des mesures physiologiques ni un avis médical : ils servent uniquement à orienter les
        prochaines séances.
      </Banner>

      <section style={{ marginTop: 'var(--s-5)' }}>
        <h3 className="section-title">Comment c’est calculé</h3>
        <Card className="stack-sm small muted">
          <p>
            Chaque séance ajoute de la charge aux zones qu’elle sollicite, proportionnellement au
            temps de travail et à l’intensité des exercices.
          </p>
          <p>
            Ton retour de fin de séance module cette charge : une séance vécue comme très difficile
            compte davantage qu’une séance vécue comme facile.
          </p>
          <p>
            La charge décroît ensuite avec le temps, plus vite pour le cardio que pour les jambes.
          </p>
        </Card>
      </section>

      <section style={{ marginTop: 'var(--s-5)' }}>
        <h3 className="section-title">Équilibre du corps sur 14 jours</h3>
        <div className="grid-2">
          <Card>
            <div className="micro dim" style={{ marginBottom: 8 }}>
              Le plus travaillé
            </div>
            <div className="stack-sm">
              {worked.map(([muscle]) => (
                <span key={muscle} className="small">
                  {MUSCLE_LABELS[muscle]}
                </span>
              ))}
            </div>
          </Card>
          <Card>
            <div className="micro dim" style={{ marginBottom: 8 }}>
              À rattraper
            </div>
            <div className="stack-sm">
              {neglected.map(([muscle]) => (
                <span key={muscle} className="small">
                  {MUSCLE_LABELS[muscle]}
                </span>
              ))}
            </div>
          </Card>
        </div>
        <p className="micro dim" style={{ marginTop: 'var(--s-2)' }}>
          Le générateur tient compte de cet écart : les groupes de droite sont prioritaires dans les
          prochaines séances.
        </p>
      </section>

      {workout ? (
        <section style={{ marginTop: 'var(--s-5)' }}>
          <h3 className="section-title">Effet sur la séance du jour</h3>
          <Card className="stack-sm">
            {workout.rationale.map((line, i) => (
              <p key={i} className="small muted">
                {line}
              </p>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
