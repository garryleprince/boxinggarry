import { useMemo, useState } from 'react';
import { navigate, useRoute } from '@/app/router';
import { useStore } from '@/app/store';
import { getExercise } from '@/data/exercises';
import { BLOCK_LABELS, ARCHETYPE_META } from '@/domain/model/workout';
import type { Workout, WorkoutBlock, WorkoutItem } from '@/domain/model/workout';
import { QUALITY_LABELS } from '@/domain/model/taxonomy';
import {
  auditDuration,
  computeBlockDuration,
  formatDuration,
  itemWorkSec,
} from '@/engines/training/duration';
import { Banner, Button, Card, Pill, Sheet } from '@/ui/primitives';
import { Figure } from '@/ui/Figure';
import { Header } from '@/ui/Header';
import { IconSwap } from '@/ui/icons';
import { BLOCK_COLOUR, QUALITY_COLOUR } from '@/ui/colours';
import { ExerciseSheet } from './ExerciseSheet';

/**
 * Session preparation.
 *
 * Everything the athlete needs to decide *before* starting: what is coming,
 * how long each block takes, and the levers to make it easier, harder, or
 * different. The timing breakdown is the engine's own arithmetic, not a
 * restatement of the headline figure.
 */
export function SessionPreview() {
  const route = useRoute();
  const isExtension = route.params['extension'] === '1';
  const { workout, extensionWorkout, extension } = useStore();
  const startSession = useStore((s) => s.startSession);
  const setAdjust = useStore((s) => s.setAdjust);
  const shuffle = useStore((s) => s.shuffle);
  const adjust = useStore((s) => s.adjust);
  const replaceExercise = useStore((s) => s.replaceExercise);

  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<{ blockId: string; index: number } | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const session = isExtension ? extensionWorkout : workout;
  const audit = useMemo(
    () => (session ? auditDuration(session.blocks, session.budgetSec) : null),
    [session],
  );

  if (!session || !audit) return null;
  const meta = ARCHETYPE_META[session.archetype];

  async function start() {
    const created = await startSession(isExtension ? 'extension' : 'principal');
    if (created) navigate('/entrainement');
  }

  return (
    <div className="screen">
      <Header
        eyebrow={isExtension ? 'Module +10' : 'Séance du jour'}
        title={isExtension ? (extension?.template.title ?? 'Extension') : session.title}
        backTo="/"
      />

      <Card className="stack" style={{ marginBottom: 'var(--s-5)' }}>
        <div className="row-between">
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <span className="num" style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1 }}>
              {Math.round(session.durationSec / 60)}
            </span>
            <span className="muted" style={{ fontWeight: 600 }}>
              MIN
            </span>
          </div>
          <div style={{ width: 54 }}>
            <Figure poses={['guard', 'jab']} cycleSec={2.6} size="100%" />
          </div>
        </div>
        <div className="pill-row">
          {session.qualities.slice(0, 3).map((q) => (
            <Pill key={q} color={QUALITY_COLOUR[q]}>
              {QUALITY_LABELS[q]}
            </Pill>
          ))}
        </div>
        <p className="small muted">
          {isExtension ? extension?.reason : `${meta.emoji} ${meta.blurb}.`}
        </p>
      </Card>

      {!isExtension ? (
        <div className="btn-row" style={{ marginBottom: 'var(--s-5)' }}>
          <Button small aria-pressed={adjust === -1} onClick={() => setAdjust(adjust === -1 ? 0 : -1)}>
            {adjust === -1 ? '✓ Allégée' : 'Faciliter'}
          </Button>
          <Button small aria-pressed={adjust === 1} onClick={() => setAdjust(adjust === 1 ? 0 : 1)}>
            {adjust === 1 ? '✓ Intensifiée' : 'Intensifier'}
          </Button>
          <Button small onClick={shuffle}>
            Varier
          </Button>
        </div>
      ) : null}

      <ol className="stack" style={{ marginBottom: 'var(--s-5)' }}>
        {session.blocks.map((block, i) => (
          <li key={block.id}>
            <BlockCard
              block={block}
              index={i}
              onOpen={(id) => setOpenExercise(id)}
              onSwap={(index) => setSwapping({ blockId: block.id, index })}
              allowSwap={!isExtension}
            />
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="btn btn--quiet btn--block"
        onClick={() => setShowAudit(true)}
        style={{ marginBottom: 'var(--s-5)' }}
      >
        Détail du minutage ({formatDuration(audit.totalSec)} / {formatDuration(audit.budgetSec)})
      </button>

      <div className="cta-dock">
        <Button variant="primary" hero onClick={start}>
          {isExtension ? 'Lancer les 10 minutes' : 'Commencer'}
        </Button>
      </div>

      <Sheet open={showAudit} onClose={() => setShowAudit(false)} title="Minutage">
        <p className="small muted" style={{ marginBottom: 'var(--s-4)' }}>
          Chaque seconde est comptée : le travail, les repos et le temps de changer de position.
          La durée affichée est le résultat de ce calcul, pas une estimation.
        </p>
        <ul className="stack-sm">
          {audit.blocks.map((b) => (
            <li key={b.id} className="row-between">
              <span className="muted">{b.title}</span>
              <span className="num">{formatDuration(b.sec)}</span>
            </li>
          ))}
          <li className="row-between">
            <span className="muted">Transitions entre blocs</span>
            <span className="num">{formatDuration(audit.transitionsSec)}</span>
          </li>
        </ul>
        <hr className="rule" />
        <div className="row-between" style={{ fontWeight: 700 }}>
          <span>Total</span>
          <span className="num">{formatDuration(audit.totalSec)}</span>
        </div>
        <div className="row-between muted small" style={{ marginTop: 6 }}>
          <span>Budget</span>
          <span className="num">{formatDuration(audit.budgetSec)}</span>
        </div>
        {!audit.withinBudget ? (
          <Banner tone="danger">Cette séance dépasse son budget. Signale-le : c’est un bug.</Banner>
        ) : null}
      </Sheet>

      <Sheet
        open={swapping != null}
        onClose={() => setSwapping(null)}
        title="Remplacer l’exercice"
      >
        <p className="small muted" style={{ marginBottom: 'var(--s-4)' }}>
          Le remplacement garde le même schéma moteur et le même objectif, pour que la séance
          conserve son sens.
        </p>
        <div className="stack-sm">
          {(
            [
              ['plus-facile', 'Plus accessible', 'Même mouvement, exigence réduite'],
              ['equivalent', 'Équivalent', 'Autre exercice de niveau comparable'],
              ['plus-dur', 'Plus exigeant', 'Même mouvement, un cran au-dessus'],
            ] as const
          ).map(([direction, title, sub]) => (
            <Button
              key={direction}
              block
              onClick={() => {
                if (swapping) replaceExercise(swapping.blockId, swapping.index, direction);
                setSwapping(null);
              }}
            >
              <span style={{ display: 'grid', textAlign: 'left', width: '100%' }}>
                <span>{title}</span>
                <span className="micro dim">{sub}</span>
              </span>
            </Button>
          ))}
        </div>
      </Sheet>

      <ExerciseSheet
        exerciseId={openExercise}
        onClose={() => setOpenExercise(null)}
      />
    </div>
  );
}

function BlockCard({
  block,
  index,
  onOpen,
  onSwap,
  allowSwap,
}: {
  block: WorkoutBlock;
  index: number;
  onOpen: (id: string) => void;
  onSwap: (itemIndex: number) => void;
  allowSwap: boolean;
}) {
  const colour = BLOCK_COLOUR[block.kind] ?? 'var(--signal)';
  return (
    <Card className="stack-sm">
      <div className="row-between">
        <div className="row" style={{ gap: 10 }}>
          <span className="block-dot" style={{ background: colour }} aria-hidden />
          <div>
            <div style={{ fontWeight: 700 }}>{block.title}</div>
            <div className="micro dim">
              {BLOCK_LABELS[block.kind]} · {block.rounds > 1 ? `${block.rounds} tours · ` : ''}
              {formatDuration(computeBlockDuration(block))}
            </div>
          </div>
        </div>
        <span className="micro dim">{index + 1}</span>
      </div>

      <p className="micro dim">{block.intent}</p>

      <ul className="stack-sm" style={{ marginTop: 4 }}>
        {block.items.map((item, i) => (
          <ItemRow
            key={`${item.exerciseId}-${i}`}
            item={item}
            onOpen={() => onOpen(String(item.exerciseId))}
            onSwap={allowSwap ? () => onSwap(i) : undefined}
          />
        ))}
      </ul>
    </Card>
  );
}

function ItemRow({
  item,
  onOpen,
  onSwap,
}: {
  item: WorkoutItem;
  onOpen: () => void;
  onSwap?: () => void;
}) {
  const ex = getExercise(item.exerciseId);
  const dose =
    item.measure === 'temps' ? `${item.dose} s` : `${item.dose} rép.`;
  return (
    <li className="item-row">
      <button type="button" className="item-row__main" onClick={onOpen}>
        <span className="item-row__figure">
          <Figure poses={ex.poses} still size="100%" />
        </span>
        <span style={{ minWidth: 0 }}>
          <span className="item-row__name">{ex.name}</span>
          <span className="micro dim" style={{ display: 'block' }}>
            {dose}
            {item.perSide ? ' par côté' : ''} · {formatDuration(itemWorkSec(item))} de travail
            {item.restAfter > 0 ? ` · ${item.restAfter} s de repos` : ''}
          </span>
        </span>
      </button>
      {onSwap ? (
        <button
          type="button"
          className="item-row__swap"
          onClick={onSwap}
          aria-label={`Remplacer ${ex.name}`}
        >
          <IconSwap size={18} />
        </button>
      ) : null}
    </li>
  );
}

export type { Workout };
