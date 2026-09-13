import { useMemo, useState } from 'react';
import { useStore } from '@/app/store';
import { EXERCISES } from '@/data/exercises';
import { EQUIPMENT_LABELS, SPACE_LABELS, type Equipment, type SpaceNeed } from '@/domain/model/taxonomy';
import type { ExerciseId } from '@/domain/model/ids';
import {
  GOALS,
  GOAL_META,
  SPORT_LEVEL_LABELS,
  type BoxingLevel,
  type Goal,
  type IntensityPreference,
  type LiftingExperience,
  type SportLevel,
  type UserProfile,
} from '@/domain/model/user';
import { Banner, Button, Chip, Choice, Field, Stepper } from '@/ui/primitives';

/**
 * Onboarding.
 *
 * Only what the engines actually consume is asked for. Every question maps to
 * a decision the generator makes — level and goals steer programming, space
 * and equipment filter the exercise pool, limitations become hard exclusions.
 */

const STEPS = [
  'Toi',
  'Niveau',
  'Objectifs',
  'Rythme',
  'Espace',
  'Limitations',
] as const;

/** Movements worth asking about by name: the ones people commonly can't do. */
const SCREENING = [
  'pompes',
  'tractions',
  'squat',
  'burpees',
  'gainage',
  'squat-saute',
  'fentes',
  'pompes-pike',
] as const;

const PATTERN_LIMITS = [
  { key: 'plyo-lower', label: 'Sauts et impacts', hint: 'Genoux, chevilles, dos sensibles' },
  { key: 'plyo-upper', label: 'Pliométrie du haut du corps', hint: 'Poignets ou épaules sensibles' },
  { key: 'push-vertical', label: 'Poussée au-dessus de la tête', hint: 'Épaules sensibles' },
  { key: 'core-flexion', label: 'Flexions du tronc', hint: 'Bas du dos ou cervicales sensibles' },
  { key: 'pull', label: 'Tirages et suspensions', hint: 'Coudes ou épaules sensibles' },
] as const;

export function Onboarding() {
  const saveProfile = useStore((s) => s.saveProfile);
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState<number | ''>('');
  const [heightCm, setHeightCm] = useState<number | ''>('');
  const [weightKg, setWeightKg] = useState<number | ''>('');

  const [sportLevel, setSportLevel] = useState<SportLevel>('intermediaire');
  const [boxingLevel, setBoxingLevel] = useState<BoxingLevel>('loisir');
  const [lifting, setLifting] = useState<LiftingExperience>('occasionnelle');

  const [goals, setGoals] = useState<Goal[]>(['condition-generale']);
  const [weeklyFrequency, setWeeklyFrequency] = useState(4);
  const [intensity, setIntensity] = useState<IntensityPreference>('equilibree');

  const [space, setSpace] = useState<SpaceNeed>('piece');
  const [equipment, setEquipment] = useState<Equipment[]>(['aucun']);

  const [mastered, setMastered] = useState<string[]>([]);
  const [difficult, setDifficult] = useState<string[]>([]);
  const [avoidPatterns, setAvoidPatterns] = useState<string[]>([]);
  const [limitations, setLimitations] = useState('');

  const screening = useMemo(
    () => SCREENING.map((id) => EXERCISES.find((e) => e.id === id)).filter((e) => e != null),
    [],
  );

  const toggle = <T,>(list: T[], value: T, setter: (v: T[]) => void) =>
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const canContinue = step !== 2 || goals.length > 0;

  async function finish() {
    const profile: UserProfile = {
      createdAt: Date.now(),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(birthYear ? { birthYear: Number(birthYear) } : {}),
      ...(heightCm ? { heightCm: Number(heightCm) } : {}),
      ...(weightKg ? { weightKg: Number(weightKg) } : {}),
      sportLevel,
      boxingLevel,
      lifting,
      weeklyFrequency,
      goals,
      intensity,
      space,
      equipment: equipment.length > 0 ? equipment : ['aucun'],
      mastered: mastered as ExerciseId[],
      difficult: difficult as ExerciseId[],
      excluded: [],
      avoidPatterns,
      ...(limitations.trim() ? { limitations: limitations.trim() } : {}),
    };
    await saveProfile(profile);
  }

  return (
    <div className="screen screen--full" style={{ maxWidth: 560 }}>
      <div className="onboard__progress" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} data-done={i <= step} />
        ))}
      </div>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        Étape {step + 1} sur {STEPS.length}
      </div>
      <h1 className="screen-title" style={{ marginBottom: 'var(--s-5)' }}>
        {
          [
            'Faisons connaissance',
            'Où tu en es',
            'Ce que tu cherches',
            'Ton rythme',
            'Ton espace',
            'Ce qu’il faut éviter',
          ][step]
        }
      </h1>

      <div className="stack" style={{ marginBottom: 'var(--s-6)' }}>
        {step === 0 ? (
          <>
            <p className="muted small">
              Tout est facultatif ici. Ces informations restent sur ton téléphone et servent
              uniquement à personnaliser l’affichage.
            </p>
            <Field label="Prénom" htmlFor="name">
              <input
                id="name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Facultatif"
                autoComplete="given-name"
              />
            </Field>
            <div className="grid-3">
              <Field label="Naissance" htmlFor="year">
                <input
                  id="year"
                  className="input"
                  inputMode="numeric"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : '')}
                  placeholder="1994"
                />
              </Field>
              <Field label="Taille (cm)" htmlFor="height">
                <input
                  id="height"
                  className="input"
                  inputMode="numeric"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value ? Number(e.target.value) : '')}
                  placeholder="178"
                />
              </Field>
              <Field label="Poids (kg)" htmlFor="weight">
                <input
                  id="weight"
                  className="input"
                  inputMode="numeric"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value ? Number(e.target.value) : '')}
                  placeholder="74"
                />
              </Field>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="stack-sm">
              <div className="section-title">Condition physique générale</div>
              {(['debutant', 'intermediaire', 'avance'] as SportLevel[]).map((level) => (
                <Choice
                  key={level}
                  title={SPORT_LEVEL_LABELS[level]}
                  sub={
                    level === 'debutant'
                      ? 'Peu ou pas d’entraînement régulier ces derniers mois'
                      : level === 'intermediaire'
                        ? 'Tu t’entraînes régulièrement, sans être un athlète'
                        : 'Entraînement soutenu et régulier depuis longtemps'
                  }
                  selected={sportLevel === level}
                  onSelect={() => setSportLevel(level)}
                />
              ))}
            </div>
            <div className="stack-sm">
              <div className="section-title">Boxe</div>
              {(
                [
                  ['aucun', 'Je débute', 'Je découvre les frappes et les appuis'],
                  ['loisir', 'Loisir', 'Je pratique en club ou seul, sans compétition'],
                  ['competiteur', 'Compétiteur', 'Je combats ou je m’y prépare'],
                ] as [BoxingLevel, string, string][]
              ).map(([value, title, sub]) => (
                <Choice
                  key={value}
                  title={title}
                  sub={sub}
                  selected={boxingLevel === value}
                  onSelect={() => setBoxingLevel(value)}
                />
              ))}
            </div>
            <div className="stack-sm">
              <div className="section-title">Musculation</div>
              {(
                [
                  ['aucune', 'Aucune expérience'],
                  ['occasionnelle', 'Occasionnelle'],
                  ['reguliere', 'Régulière'],
                ] as [LiftingExperience, string][]
              ).map(([value, title]) => (
                <Choice
                  key={value}
                  title={title}
                  selected={lifting === value}
                  onSelect={() => setLifting(value)}
                />
              ))}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <p className="muted small">
              Choisis un à trois objectifs. Ils orientent réellement la programmation : le type de
              séances de la semaine et le choix des exercices.
            </p>
            <div className="stack-sm">
              {GOALS.map((goal) => (
                <Choice
                  key={goal}
                  title={GOAL_META[goal].label}
                  sub={GOAL_META[goal].blurb}
                  selected={goals.includes(goal)}
                  onSelect={() =>
                    setGoals((current) =>
                      current.includes(goal)
                        ? current.filter((g) => g !== goal)
                        : current.length >= 3
                          ? [...current.slice(1), goal]
                          : [...current, goal],
                    )
                  }
                />
              ))}
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Field
              label="Séances par semaine"
              hint="Tu peux toujours en faire plus ou moins : le programme s’adapte."
            >
              <Stepper
                label="Séances par semaine"
                value={weeklyFrequency}
                min={2}
                max={6}
                onChange={setWeeklyFrequency}
                format={(v) => `${v} séances`}
              />
            </Field>
            <div className="stack-sm">
              <div className="section-title">Intensité souhaitée</div>
              {(
                [
                  ['progressive', 'Progressive', 'On construit patiemment, avec de la marge'],
                  ['equilibree', 'Équilibrée', 'Le bon compromis entre exigence et récupération'],
                  ['exigeante', 'Exigeante', 'Densité élevée, repos courts'],
                ] as [IntensityPreference, string, string][]
              ).map(([value, title, sub]) => (
                <Choice
                  key={value}
                  title={title}
                  sub={sub}
                  selected={intensity === value}
                  onSelect={() => setIntensity(value)}
                />
              ))}
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className="stack-sm">
              <div className="section-title">Espace disponible</div>
              {(['tapis', 'piece', 'large'] as SpaceNeed[]).map((value) => (
                <Choice
                  key={value}
                  title={SPACE_LABELS[value]}
                  sub={
                    value === 'tapis'
                      ? 'Tu peux t’allonger et bouger sur place'
                      : value === 'piece'
                        ? 'Tu peux faire deux ou trois pas'
                        : 'Tu peux te déplacer, sauter, avancer'
                  }
                  selected={space === value}
                  onSelect={() => setSpace(value)}
                />
              ))}
            </div>
            <div className="stack-sm">
              <div className="section-title">Matériel</div>
              <p className="micro dim">
                Rien n’est obligatoire : tout le programme fonctionne au poids du corps. Ce que tu
                coches ajoute simplement des exercices possibles.
              </p>
              <div className="pill-row">
                {(Object.keys(EQUIPMENT_LABELS) as Equipment[])
                  .filter((e) => e !== 'aucun')
                  .map((item) => (
                    <Chip
                      key={item}
                      selected={equipment.includes(item)}
                      onClick={() =>
                        setEquipment((current) => {
                          const next = current.includes(item)
                            ? current.filter((x) => x !== item)
                            : [...current, item];
                          return next.includes('aucun') ? next : ['aucun', ...next];
                        })
                      }
                    >
                      {EQUIPMENT_LABELS[item]}
                    </Chip>
                  ))}
              </div>
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <Banner>
              Boxing Body Coach est une application d’entraînement. Elle ne pose aucun diagnostic et
              ne remplace pas un professionnel de santé. En cas de douleur, arrête et consulte.
            </Banner>
            <div className="stack-sm">
              <div className="section-title">Mouvements à éviter</div>
              <p className="micro dim">
                Ce que tu coches ici ne sera jamais programmé. Tu peux le modifier à tout moment.
              </p>
              {PATTERN_LIMITS.map(({ key, label, hint }) => (
                <Choice
                  key={key}
                  title={label}
                  sub={hint}
                  selected={avoidPatterns.includes(key)}
                  onSelect={() => toggle(avoidPatterns, key, setAvoidPatterns)}
                />
              ))}
            </div>
            <div className="stack-sm">
              <div className="section-title">Exercices que tu maîtrises</div>
              <div className="pill-row">
                {screening.map((ex) => (
                  <Chip
                    key={ex!.id}
                    selected={mastered.includes(ex!.id)}
                    onClick={() => toggle(mastered, ex!.id, setMastered)}
                  >
                    {ex!.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="stack-sm">
              <div className="section-title">Exercices qui te posent problème</div>
              <div className="pill-row">
                {screening.map((ex) => (
                  <Chip
                    key={ex!.id}
                    selected={difficult.includes(ex!.id)}
                    onClick={() => toggle(difficult, ex!.id, setDifficult)}
                  >
                    {ex!.name}
                  </Chip>
                ))}
              </div>
            </div>
            <Field
              label="Autre chose à signaler ?"
              htmlFor="limitations"
              hint="Une gêne, une blessure ancienne, une contrainte. Pour mémoire uniquement."
            >
              <textarea
                id="limitations"
                className="textarea"
                value={limitations}
                onChange={(e) => setLimitations(e.target.value)}
                placeholder="Facultatif"
              />
            </Field>
          </>
        ) : null}
      </div>

      <div className="btn-row" style={{ position: 'sticky', bottom: 'var(--s-4)' }}>
        {step > 0 ? (
          <Button onClick={() => setStep((s) => s - 1)} variant="ghost">
            Retour
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            Continuer
          </Button>
        ) : (
          <Button variant="primary" onClick={finish}>
            Terminer
          </Button>
        )}
      </div>
    </div>
  );
}
