import { useMemo, useState } from 'react';
import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { addDays, dateKey, daysBetween, parseDateKey, startOfWeek } from '@/domain/model/ids';
import type { DateKey } from '@/domain/model/ids';
import { ARCHETYPE_META } from '@/domain/model/workout';
import { monthGrid, planWeek } from '@/engines/training/plan';
import { Card, Empty } from '@/ui/primitives';
import { Header } from '@/ui/Header';
import { ARCHETYPE_COLOUR } from '@/ui/colours';

/**
 * Calendar (cahier des charges §13).
 *
 * Week view for planning the next few days, month view for seeing the pattern
 * of the last few weeks. Completed days carry their real duration, not the
 * planned one.
 */
export function Calendar() {
  const { core, recent, today } = useStore();
  const [mode, setMode] = useState<'semaine' | 'mois'>('semaine');
  const [anchor, setAnchor] = useState<DateKey>(today);

  const weeks = useMemo(() => {
    if (!core.profile) return [];
    const start = startOfWeek(anchor);
    return [-1, 0, 1, 2].map((offset) =>
      planWeek(core.profile!, addDays(start, offset * 7), today, recent),
    );
  }, [core.profile, anchor, today, recent]);

  const month = useMemo(() => {
    const d = parseDateKey(anchor);
    return { grid: monthGrid(d), label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) };
  }, [anchor]);

  const doneByDate = useMemo(() => {
    const map = new Map<string, { minutes: number; archetype: string }>();
    for (const s of core.sessions) {
      if (s.status !== 'terminee') continue;
      const current = map.get(s.date) ?? { minutes: 0, archetype: s.archetype };
      map.set(s.date, {
        minutes: current.minutes + Math.round(s.elapsedSec / 60),
        archetype: s.extensionOf ? current.archetype : s.archetype,
      });
    }
    return map;
  }, [core.sessions]);

  if (!core.profile) return null;

  return (
    <div className="screen">
      <Header
        eyebrow="Programme"
        title="Calendrier"
        trailing={
          <div className="seg" role="tablist">
            {(['semaine', 'mois'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className="seg__btn"
                onClick={() => setMode(m)}
              >
                {m === 'semaine' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
        }
      />

      {mode === 'semaine' ? (
        <div className="stack">
          {weeks.map((week) => (
            <section key={week.weekStart}>
              <h3 className="section-title">{weekLabel(week.weekStart, today)}</h3>
              <div className="stack-sm">
                {week.days.map((day) => {
                  const meta = ARCHETYPE_META[day.archetype];
                  const done = doneByDate.get(day.date);
                  const isToday = day.date === today;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className="day"
                      data-status={day.status}
                      data-today={isToday}
                      onClick={() => (isToday ? navigate('/seance') : undefined)}
                    >
                      <span className="day__date">
                        <span className="day__dow">{dayOfWeek(day.date)}</span>
                        <span className="day__num num">{parseDateKey(day.date).getDate()}</span>
                      </span>
                      <span className="day__body">
                        {day.status === 'repos' ? (
                          <>
                            <span className="day__title dim">😴 Repos</span>
                            <span className="micro dim">Récupération complète</span>
                          </>
                        ) : (
                          <>
                            <span className="day__title">
                              {meta.emoji} {meta.label}
                            </span>
                            <span className="micro dim">
                              {done ? `${done.minutes} min réalisées` : `${day.plannedMinutes} min`}
                              {day.status === 'manquee' ? ' · non faite' : ''}
                            </span>
                          </>
                        )}
                      </span>
                      <span
                        className="day__mark"
                        data-status={day.status}
                        style={
                          day.status === 'faite'
                            ? { background: ARCHETYPE_COLOUR[day.archetype] }
                            : undefined
                        }
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="stack">
          <div className="row-between">
            <button
              className="btn btn--quiet btn--sm"
              onClick={() => setAnchor(shiftMonth(anchor, -1))}
            >
              ‹ Précédent
            </button>
            <strong style={{ textTransform: 'capitalize' }}>{month.label}</strong>
            <button
              className="btn btn--quiet btn--sm"
              onClick={() => setAnchor(shiftMonth(anchor, 1))}
            >
              Suivant ›
            </button>
          </div>
          <Card>
            <div className="month">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <span key={i} className="month__head micro dim">
                  {d}
                </span>
              ))}
              {month.grid.map((key) => {
                const inMonth = parseDateKey(key).getMonth() === parseDateKey(anchor).getMonth();
                const done = doneByDate.get(key);
                return (
                  <span
                    key={key}
                    className="month__cell num"
                    data-outside={!inMonth}
                    data-today={key === today}
                  >
                    {parseDateKey(key).getDate()}
                    {done ? (
                      <span
                        className="month__dot"
                        style={{ background: ARCHETYPE_COLOUR[done.archetype as never] ?? 'var(--signal)' }}
                      />
                    ) : null}
                  </span>
                );
              })}
            </div>
          </Card>
          {doneByDate.size === 0 ? (
            <Empty title="Aucune séance enregistrée" hint="Les jours travaillés apparaîtront ici." />
          ) : null}
        </div>
      )}
    </div>
  );
}

function weekLabel(weekStart: DateKey, today: DateKey): string {
  const diff = daysBetween(startOfWeek(today), weekStart);
  if (diff === 0) return 'Cette semaine';
  if (diff === 7) return 'Semaine prochaine';
  if (diff === -7) return 'Semaine dernière';
  const end = addDays(weekStart, 6);
  const fmt = (k: DateKey) =>
    parseDateKey(k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

const dayOfWeek = (key: DateKey) =>
  parseDateKey(key).toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3).toUpperCase();

function shiftMonth(key: DateKey, delta: number): DateKey {
  const d = parseDateKey(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}
