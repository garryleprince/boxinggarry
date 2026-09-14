import { useEffect, useState } from 'react';
import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { EQUIPMENT_LABELS, SPACE_LABELS, type Equipment, type SpaceNeed } from '@/domain/model/taxonomy';
import type { AudioMode } from '@/domain/model/user';
import { audioLimitations, capabilities } from '@/engines/timer/audio';
import { requestPersistence, storageEstimate } from '@/storage/idb';
import { isDeviceRemembered } from '@/auth/session';
import { Banner, Button, Card, Chip, Choice, Field, Sheet } from '@/ui/primitives';
import { Header } from '@/ui/Header';
import { Assessment } from './Assessment';

/** Settings (cahier des charges §56, §57). */
export function Settings() {
  const { core } = useStore();
  const updateSettings = useStore((s) => s.updateSettings);
  const saveProfile = useStore((s) => s.saveProfile);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const resetEverything = useStore((s) => s.resetEverything);
  const lock = useStore((s) => s.lock);

  const [remembered, setRemembered] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<{ granted: boolean; supported: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [redoAssessment, setRedoAssessment] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);

  const caps = capabilities();
  const profile = core.profile;

  useEffect(() => {
    void isDeviceRemembered().then(setRemembered);
    void storageEstimate().then(setStorage);
  }, []);

  if (redoAssessment) {
    return <Assessment onDone={() => setRedoAssessment(false)} />;
  }

  async function doExport() {
    const json = await exportData();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `boxing-body-coach-${stamp}.json`;
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      /* falls through to the on-screen copy below */
    }
    // Safari on iOS often ignores a scripted download, so the JSON is also
    // shown for copy-paste or sharing — the export must never be a dead end.
    setExportText(json);
  }

  return (
    <div className="screen">
      <Header eyebrow="Réglages" title="Paramètres" backTo="/plus" />

      {/* -------------------------------------------------------- profil */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Profil</h3>
        <Card className="stack">
          <Field label="Prénom" htmlFor="s-name">
            <input
              id="s-name"
              className="input"
              value={profile?.name ?? ''}
              onChange={(e) =>
                profile && void saveProfile({ ...profile, name: e.target.value })
              }
              placeholder="Facultatif"
            />
          </Field>
          <div className="grid-3">
            <Field label="Taille (cm)" htmlFor="s-height">
              <input
                id="s-height"
                className="input"
                inputMode="numeric"
                value={profile?.heightCm ?? ''}
                onChange={(e) =>
                  profile &&
                  void saveProfile({
                    ...profile,
                    heightCm: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
            <Field label="Poids (kg)" htmlFor="s-weight">
              <input
                id="s-weight"
                className="input"
                inputMode="numeric"
                value={profile?.weightKg ?? ''}
                onChange={(e) =>
                  profile &&
                  void saveProfile({
                    ...profile,
                    weightKg: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
            <Field label="Naissance" htmlFor="s-year">
              <input
                id="s-year"
                className="input"
                inputMode="numeric"
                value={profile?.birthYear ?? ''}
                onChange={(e) =>
                  profile &&
                  void saveProfile({
                    ...profile,
                    birthYear: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
          </div>
          <Button block onClick={() => navigate('/objectifs')}>
            Objectifs et fréquence
          </Button>
          <Button block onClick={() => setRedoAssessment(true)}>
            Refaire l’évaluation initiale
          </Button>
        </Card>
      </section>

      {/* ------------------------------------------------------- matériel */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Espace et matériel</h3>
        <Card className="stack">
          <div className="stack-sm">
            {(['tapis', 'piece', 'large'] as SpaceNeed[]).map((value) => (
              <Choice
                key={value}
                title={SPACE_LABELS[value]}
                selected={profile?.space === value}
                onSelect={() => profile && void saveProfile({ ...profile, space: value })}
              />
            ))}
          </div>
          <div className="pill-row">
            {(Object.keys(EQUIPMENT_LABELS) as Equipment[])
              .filter((e) => e !== 'aucun')
              .map((item) => (
                <Chip
                  key={item}
                  selected={profile?.equipment.includes(item) ?? false}
                  onClick={() => {
                    if (!profile) return;
                    const next = profile.equipment.includes(item)
                      ? profile.equipment.filter((x) => x !== item)
                      : [...profile.equipment, item];
                    void saveProfile({
                      ...profile,
                      equipment: next.includes('aucun') ? next : ['aucun', ...next],
                    });
                  }}
                >
                  {EQUIPMENT_LABELS[item]}
                </Chip>
              ))}
          </div>
        </Card>
      </section>

      {/* ---------------------------------------------------------- audio */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Son et vibration</h3>
        <div className="stack-sm">
          {(
            [
              ['audio-vibration', 'Son et vibration'],
              ['audio', 'Son seul'],
              ['vibration', 'Vibration seule'],
              ['silence', 'Silencieux'],
            ] as [AudioMode, string][]
          ).map(([value, label]) => (
            <Choice
              key={value}
              title={label}
              sub={
                value.includes('vibration') && !caps.vibration
                  ? 'Vibration indisponible sur cet appareil'
                  : undefined
              }
              selected={core.settings.audioMode === value}
              onSelect={() => void updateSettings({ audioMode: value })}
            />
          ))}
        </div>
        <Card className="stack" style={{ marginTop: 'var(--s-3)' }}>
          <Toggle
            label="Bips de compte à rebours"
            sub="Trois bips avant chaque changement de phase"
            checked={core.settings.countdownBeeps}
            onChange={(v) => void updateSettings({ countdownBeeps: v })}
          />
          <Toggle
            label="Annonces vocales"
            sub={
              caps.speech
                ? 'Les combinaisons sont annoncées pendant le shadowboxing'
                : 'Synthèse vocale indisponible sur cet appareil'
            }
            checked={core.settings.voiceCallouts}
            disabled={!caps.speech}
            onChange={(v) => void updateSettings({ voiceCallouts: v })}
          />
          <div className="row-between">
            <span className="small">Langue des annonces</span>
            <div className="seg">
              {(['fr', 'en'] as const).map((l) => (
                <button
                  key={l}
                  className="seg__btn"
                  aria-selected={core.settings.voiceLang === l}
                  onClick={() => void updateSettings({ voiceLang: l })}
                >
                  {l === 'fr' ? 'Un — Deux' : 'One — Two'}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            label="Garder l’écran allumé"
            sub={
              caps.wakeLock
                ? 'Pendant les séances et les rounds'
                : 'Non disponible sur cet appareil'
            }
            checked={core.settings.keepScreenAwake}
            disabled={!caps.wakeLock}
            onChange={(v) => void updateSettings({ keepScreenAwake: v })}
          />
        </Card>
        <div className="stack-sm" style={{ marginTop: 'var(--s-3)' }}>
          {audioLimitations().map((note, i) => (
            <p key={i} className="micro dim">
              {note}
            </p>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- thème */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Apparence</h3>
        <div className="stack-sm">
          {(
            [
              ['sombre', 'Sombre'],
              ['clair', 'Clair'],
              ['systeme', 'Comme le système'],
            ] as const
          ).map(([value, label]) => (
            <Choice
              key={value}
              title={label}
              selected={core.settings.theme === value}
              onSelect={() => void updateSettings({ theme: value })}
            />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- animations */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Démonstrations des exercices</h3>
        <div className="stack-sm">
          {(
            [
              [
                'systeme',
                'Comme le système',
                'Suit « Réduire les animations » dans les réglages d’iOS',
              ],
              ['toujours', 'Toujours animées', 'Même si tu réduis les animations ailleurs'],
              ['jamais', 'Jamais animées', 'Position de départ et position finale superposées'],
            ] as const
          ).map(([value, label, sub]) => (
            <Choice
              key={value}
              title={label}
              sub={sub}
              selected={core.settings.animations === value}
              onSelect={() => void updateSettings({ animations: value })}
            />
          ))}
        </div>
        <p className="micro dim" style={{ marginTop: 'var(--s-3)' }}>
          Si les mannequins ne bougent pas, c’est que « Réduire les animations » est actif dans
          Réglages → Accessibilité → Mouvement. Choisis « Toujours animées » pour les garder ici
          sans changer le réglage de ton iPhone.
        </p>
      </section>

      {/* ------------------------------------------------------- données */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Données</h3>
        <Card className="stack">
          <p className="small muted">
            Tout est stocké chiffré sur ce téléphone. Rien n’est envoyé sur un serveur, ce qui veut
            aussi dire qu’il n’y a pas de sauvegarde ailleurs : l’export est ta seule copie de
            secours.
          </p>
          {storage ? (
            <p className="micro dim">
              Environ {(storage.usage / 1024 / 1024).toFixed(1)} Mo utilisés
              {storage.quota > 0
                ? ` sur ${(storage.quota / 1024 / 1024).toFixed(0)} Mo disponibles`
                : ''}
              .
            </p>
          ) : null}
          <Button block onClick={doExport}>
            Exporter mes données (JSON)
          </Button>
          <label className="btn btn--ghost btn--block" style={{ cursor: 'pointer' }}>
            Importer un export
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImportError(null);
                try {
                  await importData(await file.text());
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : 'Import impossible.');
                }
                e.target.value = '';
              }}
            />
          </label>
          {importError ? <Banner tone="danger">{importError}</Banner> : null}
          <Button
            block
            onClick={async () => {
              const result = await requestPersistence();
              setPersisted(result);
            }}
          >
            Demander un stockage persistant
          </Button>
          {persisted ? (
            <Banner tone={persisted.granted ? 'neutral' : 'warn'}>
              {!persisted.supported
                ? 'Ce navigateur ne propose pas le stockage persistant.'
                : persisted.granted
                  ? 'Stockage persistant accordé : iOS gardera tes données même sous pression de stockage.'
                  : 'Le navigateur a refusé. Tes données restent enregistrées mais peuvent être effacées si le téléphone manque d’espace ou si tu n’ouvres pas l’application pendant longtemps. Exporte régulièrement.'}
            </Banner>
          ) : null}
        </Card>
      </section>

      {/* ------------------------------------------------------- sécurité */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Sécurité</h3>
        <Card className="stack">
          <p className="small muted">
            {remembered
              ? 'Cet appareil est mémorisé : l’application s’ouvre sans phrase secrète. N’importe qui pouvant déverrouiller ce téléphone peut donc voir tes données.'
              : 'La phrase secrète est demandée à chaque ouverture.'}
          </p>
          <Button
            block
            onClick={async () => {
              await lock();
              navigate('/', { replace: true });
            }}
          >
            Verrouiller maintenant
          </Button>
        </Card>
      </section>

      {/* -------------------------------------------------- réinitialiser */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Réinitialiser</h3>
        <Button variant="danger" block onClick={() => setConfirmReset(true)}>
          Tout effacer
        </Button>
      </section>

      <Sheet open={exportText != null} onClose={() => setExportText(null)} title="Export">
        <p className="small muted" style={{ marginBottom: 'var(--s-3)' }}>
          Le téléchargement a été lancé. Si ton navigateur l’a bloqué, copie le texte ci-dessous et
          enregistre-le où tu veux.
        </p>
        <Button
          block
          onClick={() => {
            if (exportText) void navigator.clipboard?.writeText(exportText).catch(() => undefined);
          }}
        >
          Copier dans le presse-papiers
        </Button>
        <textarea
          className="textarea"
          readOnly
          value={exportText ?? ''}
          style={{ marginTop: 'var(--s-3)', minHeight: 200, fontFamily: 'var(--font-num)', fontSize: 11 }}
        />
      </Sheet>

      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Tout effacer ?">
        <Banner tone="danger">
          Cette action supprime définitivement ton profil, tes séances, tes records et ta phrase
          secrète. Elle est irréversible et il n’existe aucune copie ailleurs.
        </Banner>
        <div className="stack-sm" style={{ marginTop: 'var(--s-4)' }}>
          <Button block onClick={() => setConfirmReset(false)}>
            Annuler
          </Button>
          <Button block onClick={doExport}>
            Exporter d’abord
          </Button>
          <Button
            block
            variant="danger"
            onClick={async () => {
              await resetEverything();
              navigate('/', { replace: true });
            }}
          >
            Effacer définitivement
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Toggle({
  label,
  sub,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="row-between" style={{ opacity: disabled ? 0.5 : 1 }}>
      <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <span className="small" style={{ fontWeight: 600 }}>
          {label}
        </span>
        {sub ? <span className="micro dim">{sub}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 24, height: 24, accentColor: 'var(--signal)', flexShrink: 0 }}
      />
    </label>
  );
}
