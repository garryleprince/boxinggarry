import type { AppSettings } from '@/domain/model/user';

/**
 * Audio and haptic cues.
 *
 * Every sound is synthesised with the Web Audio API rather than shipped as a
 * file: no network request, works offline from the first launch, and costs
 * nothing on a mobile connection.
 *
 * iOS realities this module handles rather than hides:
 *  - an `AudioContext` may only be created or resumed inside a user gesture,
 *    so `unlock()` must be called from the tap that starts the session;
 *  - `navigator.vibrate` does not exist in Safari on iOS — haptics are simply
 *    unavailable there, and `capabilities()` reports that honestly instead of
 *    the settings screen pretending otherwise;
 *  - **iOS silences Web Audio when the ring/silent switch is on**, unlike
 *    `<audio>` elements. Two measures move the app onto the media channel so
 *    cues are heard with the ringer off: the AudioSession API where Safari
 *    supports it, and a near-silent looping `<audio>` element as the fallback
 *    on older iOS;
 *  - audio stops when iOS suspends the page (app backgrounded or screen
 *    locked). The timer stays accurate because it is timestamp-based, but no
 *    beep will sound while the app is not in the foreground. The screen wake
 *    lock is requested to keep the session visible for as long as possible.
 */

export interface AudioCapabilities {
  readonly webAudio: boolean;
  readonly speech: boolean;
  readonly vibration: boolean;
  readonly wakeLock: boolean;
}

/**
 * A near-silent WAV, built at runtime rather than shipped as a file.
 *
 * Played on a loop during a session, it keeps the page on iOS's media audio
 * channel, which is what stops the hardware silent switch from muting the Web
 * Audio cues. Eight-bit PCM silence is 128, not 0.
 */
function silentWavDataUri(seconds = 0.5): string {
  const rate = 8000;
  const samples = Math.max(1, Math.floor(rate * seconds));
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);

  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Ask iOS to treat this page as media playback rather than ambient sound. */
function claimPlaybackSession(): void {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    // Safari's default is ambient, which the ringer switch mutes.
    session.type = 'playback';
  } catch {
    /* older Safari: the silent element below is the fallback */
  }
}

export function capabilities(): AudioCapabilities {
  const w = typeof window === 'undefined' ? undefined : window;
  return {
    webAudio: !!w && ('AudioContext' in w || 'webkitAudioContext' in w),
    speech: !!w && 'speechSynthesis' in w && 'SpeechSynthesisUtterance' in w,
    vibration: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
    wakeLock: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
  };
}

export type CueKind =
  | 'debut'
  | 'fin'
  | 'repos'
  | 'compte-a-rebours'
  | 'transition'
  | 'seance-terminee';

/** Frequency / duration recipes for each cue, in Hz and seconds. */
const CUES: Record<CueKind, { readonly notes: readonly [number, number][]; gain: number }> = {
  debut: { notes: [[880, 0.12], [1320, 0.18]], gain: 0.5 },
  fin: { notes: [[660, 0.1], [440, 0.22]], gain: 0.5 },
  repos: { notes: [[520, 0.16]], gain: 0.38 },
  'compte-a-rebours': { notes: [[1000, 0.07]], gain: 0.32 },
  transition: { notes: [[700, 0.08]], gain: 0.26 },
  'seance-terminee': {
    notes: [[660, 0.12], [880, 0.12], [1100, 0.26]],
    gain: 0.52,
  },
};

const VIBRATION: Record<CueKind, number | number[]> = {
  debut: [60, 40, 90],
  fin: [140],
  repos: [70],
  'compte-a-rebours': [30],
  transition: [20],
  'seance-terminee': [90, 60, 90, 60, 160],
};

type AudioContextCtor = typeof AudioContext;

function resolveContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioCoach {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private settings: AppSettings;
  private wakeLock: WakeLockSentinel | null = null;
  /** Silent looping element: keeps the audio session alive between cues. */
  private keepAlive: HTMLAudioElement | null = null;

  constructor(settings: AppSettings) {
    this.settings = settings;
  }

  update(settings: AppSettings) {
    this.settings = settings;
    if (!this.wantsAudio) void this.releaseWakeLock();
  }

  private get wantsAudio(): boolean {
    return this.settings.audioMode === 'audio' || this.settings.audioMode === 'audio-vibration';
  }

  private get wantsVibration(): boolean {
    return (
      this.settings.audioMode === 'vibration' || this.settings.audioMode === 'audio-vibration'
    );
  }

  /**
   * Must be called from inside a user gesture (the tap that starts a session).
   * Creating the context anywhere else leaves it permanently suspended on iOS.
   */
  async unlock(): Promise<void> {
    if (this.unlocked) {
      await this.ctx?.resume().catch(() => undefined);
      return;
    }
    // Must happen before the context exists, and inside the gesture.
    claimPlaybackSession();
    this.startKeepAlive();

    const Ctor = resolveContextCtor();
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      await this.ctx.resume();
      // A zero-length silent buffer completes the unlock handshake on iOS.
      const buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
      this.unlocked = true;
    } catch {
      this.ctx = null;
    }

    // Priming the speech engine inside the same gesture avoids the first
    // callout being swallowed on iOS.
    if (this.settings.voiceCallouts && capabilities().speech) {
      try {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch {
        /* speech unavailable — callouts degrade to beeps and on-screen text */
      }
    }
  }

  /**
   * Start the silent loop that keeps iOS on the media channel.
   * Must be called from a user gesture, like everything else audio on iOS.
   */
  private startKeepAlive(): void {
    if (this.keepAlive || typeof document === 'undefined') return;
    try {
      const el = document.createElement('audio');
      el.src = silentWavDataUri();
      el.loop = true;
      // Not strictly zero: some iOS builds skip media they consider empty.
      el.volume = 0.0001;
      el.setAttribute('playsinline', '');
      el.setAttribute('aria-hidden', 'true');
      void el.play().catch(() => undefined);
      this.keepAlive = el;
    } catch {
      /* the cues still play whenever the ringer is on */
    }
  }

  cue(kind: CueKind): void {
    if (kind === 'compte-a-rebours' && !this.settings.countdownBeeps) return;
    if (this.wantsAudio) this.tone(kind);
    if (this.wantsVibration) this.buzz(kind);
  }

  private tone(kind: CueKind): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const recipe = CUES[kind];
    let at = ctx.currentTime;
    for (const [freq, length] of recipe.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      // Short attack and exponential release: a clean click, never a pop.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(recipe.gain, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + length + 0.02);
      at += length;
    }
  }

  private buzz(kind: CueKind): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(VIBRATION[kind]);
    } catch {
      /* vibration refused — nothing to recover, the beep already fired */
    }
  }

  /** Speak a combination or an exercise name. No-op when voice is off. */
  speak(text: string): void {
    if (!this.settings.voiceCallouts || !this.wantsAudio) return;
    if (!capabilities().speech) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.settings.voiceLang === 'fr' ? 'fr-FR' : 'en-US';
      u.rate = 1.05;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore: the on-screen notation is the primary channel */
    }
  }

  cancelSpeech(): void {
    if (!capabilities().speech) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  /**
   * Ask iOS to keep the screen on during a session. Supported in Safari since
   * iOS 16.4; where it is not, the athlete simply has to tap the screen
   * occasionally — the timer itself is unaffected.
   */
  async requestWakeLock(): Promise<boolean> {
    if (!this.settings.keepScreenAwake || !capabilities().wakeLock) return false;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
      return true;
    } catch {
      return false;
    }
  }

  async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      /* already released */
    }
    this.wakeLock = null;
  }

  /** Re-acquire the wake lock after the app returns to the foreground. */
  async reacquireWakeLock(): Promise<void> {
    if (this.wakeLock) return;
    await this.requestWakeLock();
  }

  async dispose(): Promise<void> {
    this.cancelSpeech();
    await this.releaseWakeLock();
    this.keepAlive?.pause();
    if (this.keepAlive) this.keepAlive.src = '';
    this.keepAlive = null;
    try {
      await this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.unlocked = false;
  }
}

/**
 * Plain-language notes on what actually works on this device, shown in the
 * settings screen so nothing is claimed that the platform does not deliver.
 */
export function audioLimitations(): string[] {
  const caps = capabilities();
  const notes: string[] = [];
  if (!caps.vibration) {
    notes.push(
      'La vibration n’est pas disponible dans Safari sur iPhone : iOS ne l’expose pas aux applications web. Les signaux sonores restent actifs.',
    );
  }
  if (!caps.speech) {
    notes.push(
      'La synthèse vocale n’est pas disponible sur cet appareil. Les combinaisons restent affichées en gros à l’écran.',
    );
  }
  if (!caps.wakeLock) {
    notes.push(
      'Le maintien de l’écran allumé n’est pas disponible sur cet appareil. Pense à régler le verrouillage automatique plus long dans les Réglages iOS.',
    );
  }
  notes.push(
    'Les signaux sonores ne se déclenchent que si l’application est au premier plan et l’écran allumé : iOS suspend le JavaScript en arrière-plan. Le chronomètre reste juste et se resynchronise dès que tu reviens.',
  );
  if (!('audioSession' in navigator)) {
    notes.push(
      'Sur iPhone, le bouton silencieux coupe le son des applications web. L’application demande à être traitée comme de la lecture média pour passer outre, mais si tu n’entends rien, vérifie ce bouton sur le côté du téléphone.',
    );
  }
  return notes;
}
