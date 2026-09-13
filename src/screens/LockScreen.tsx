import { useState } from 'react';
import { useStore } from '@/app/store';
import { MIN_PASSPHRASE_LENGTH, WrongPassphraseError, passphraseStrength } from '@/storage/crypto';
import { Banner, Button, Field } from '@/ui/primitives';
import { Figure } from '@/ui/Figure';

/**
 * Vault creation and unlocking.
 *
 * There is no account and no server: the passphrase derives the key that
 * decrypts this device's data. It is never stored and never transmitted, which
 * also means it cannot be recovered — the screen says so before the athlete
 * commits to one.
 */
export function LockScreen({ mode }: { mode: 'creation' | 'verrouille' }) {
  const createVault = useStore((s) => s.createVault);
  const unlock = useStore((s) => s.unlock);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(mode === 'creation');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creating = mode === 'creation';
  const strength = passphraseStrength(passphrase);
  const tooShort = passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE_LENGTH;
  const mismatch = creating && confirm.length > 0 && confirm !== passphrase;
  const canSubmit =
    passphrase.length >= MIN_PASSPHRASE_LENGTH && (!creating || confirm === passphrase) && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (creating) await createVault(passphrase, remember);
      else await unlock(passphrase, remember);
      setPassphrase('');
      setConfirm('');
    } catch (err) {
      setError(
        err instanceof WrongPassphraseError
          ? 'Phrase secrète incorrecte.'
          : err instanceof Error
            ? err.message
            : 'Une erreur est survenue.',
      );
    } finally {
      setBusy(false);
    }
  }

  const strengthColour = ['var(--ink-3)', 'var(--danger)', 'var(--warn)', 'var(--ok)', 'var(--ok)'];

  return (
    <form className="lock" onSubmit={submit}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--s-3)' }}>
        <Figure poses={['guard']} still size={84} />
        <div style={{ textAlign: 'center' }}>
          <div className="eyebrow">Boxing Body Coach</div>
          <h1 className="screen-title" style={{ fontSize: 'var(--t-title)' }}>
            {creating ? 'Protège tes données' : 'Content de te revoir'}
          </h1>
        </div>
      </div>

      {creating ? (
        <Banner>
          Tes données restent sur ce téléphone et sont chiffrées avec cette phrase secrète. Elle
          n’est ni enregistrée ni envoyée nulle part : <strong>elle ne peut pas être récupérée</strong>.
          Choisis une phrase dont tu te souviendras, et pense à exporter tes données de temps en temps.
        </Banner>
      ) : null}

      <Field
        label="Phrase secrète"
        htmlFor="passphrase"
        hint={creating ? strength.hint : 'Celle que tu as choisie à la première ouverture.'}
      >
        <input
          id="passphrase"
          className={`input ${tooShort ? 'input--invalid' : ''}`}
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={creating ? 'Au moins 8 caractères' : ''}
        />
      </Field>

      {creating ? (
        <>
          <div className="lock__strength" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                style={{
                  background: strength.score >= i ? strengthColour[strength.score] : 'var(--ink-3)',
                }}
              />
            ))}
          </div>
          <Field label="Confirme la phrase secrète" htmlFor="confirm">
            <input
              id="confirm"
              className={`input ${mismatch ? 'input--invalid' : ''}`}
              type="password"
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {mismatch ? (
            <p className="small" style={{ color: 'var(--danger)' }}>
              Les deux phrases ne correspondent pas.
            </p>
          ) : null}
        </>
      ) : null}

      <label className="choice" style={{ minHeight: 48 }}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--signal)' }}
        />
        <span style={{ display: 'grid', gap: 2 }}>
          <span className="choice__title">Rester connecté sur cet appareil</span>
          <span className="choice__sub">
            Pratique au quotidien. À décocher si quelqu’un d’autre peut déverrouiller ce téléphone.
          </span>
        </span>
      </label>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <Button type="submit" variant="primary" hero disabled={!canSubmit}>
        {busy ? 'Chiffrement…' : creating ? 'Créer mon espace' : 'Déverrouiller'}
      </Button>

      {creating ? (
        <p className="micro dim" style={{ textAlign: 'center' }}>
          Aucun compte, aucun serveur, aucune donnée envoyée. Tout se passe sur ce téléphone.
        </p>
      ) : null}
    </form>
  );
}
