import { useMemo, useState } from 'react';
import { EXERCISES } from '@/data/exercises';
import {
  MUSCLE_LABELS,
  PATTERNS,
  PATTERN_LABELS,
  QUALITY_LABELS,
  type Pattern,
} from '@/domain/model/taxonomy';
import { Chip, Empty } from '@/ui/primitives';
import { Figure } from '@/ui/Figure';
import { Header } from '@/ui/Header';
import { ExerciseSheet } from './ExerciseSheet';
import { QUALITY_COLOUR } from '@/ui/colours';

/** Exercise library (cahier des charges §24) — searchable and filterable. */
export function Library() {
  const [query, setQuery] = useState('');
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((ex) => {
      if (pattern && ex.pattern !== pattern) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q) ||
        ex.primary.some((m) => MUSCLE_LABELS[m].toLowerCase().includes(q)) ||
        ex.qualities.some((k) => QUALITY_LABELS[k].toLowerCase().includes(q))
      );
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'fr'));
  }, [query, pattern]);

  return (
    <div className="screen">
      <Header eyebrow="Référence" title="Bibliothèque" backTo="/plus" />

      <input
        className="input"
        type="search"
        placeholder="Chercher un exercice, un muscle, une qualité…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 'var(--s-3)' }}
        aria-label="Rechercher un exercice"
      />

      <div
        className="pill-row"
        style={{ marginBottom: 'var(--s-4)', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}
      >
        <Chip selected={pattern === null} onClick={() => setPattern(null)}>
          Tout ({EXERCISES.length})
        </Chip>
        {PATTERNS.filter((p) => EXERCISES.some((e) => e.pattern === p)).map((p) => (
          <Chip key={p} selected={pattern === p} onClick={() => setPattern(pattern === p ? null : p)}>
            {PATTERN_LABELS[p]}
          </Chip>
        ))}
      </div>

      {results.length === 0 ? (
        <Empty title="Aucun exercice ne correspond" hint="Essaie un autre mot ou retire le filtre." />
      ) : (
        <ul className="stack-sm">
          {results.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                className="card card--tap item-row__main"
                style={{ width: '100%' }}
                onClick={() => setOpen(ex.id)}
              >
                <span className="item-row__figure" style={{ width: 46, height: 46 }}>
                  <Figure poses={ex.poses} still size="100%" />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 600, display: 'block' }}>{ex.name}</span>
                  <span className="micro dim" style={{ display: 'block' }}>
                    Niveau {ex.level} · {ex.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}
                  </span>
                  <span className="pill-row" style={{ marginTop: 6 }}>
                    {ex.qualities.slice(0, 2).map((q) => (
                      <span key={q} className="pill" style={{ color: QUALITY_COLOUR[q] }}>
                        {QUALITY_LABELS[q]}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ExerciseSheet exerciseId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
