/**
 * Timer engine.
 *
 * Built on absolute timestamps, never on a counter decremented once a second.
 * iOS throttles or fully suspends JavaScript in a backgrounded tab, and a
 * decrementing counter silently loses every second it misses. Here the
 * remaining time is always recomputed as `deadline - now`, so the timer is
 * correct the instant the app comes back — whether it was away for 200 ms or
 * ten minutes (cahier des charges §27).
 *
 * The engine is a plain class with an injectable clock: no DOM, no React, and
 * fully testable by stepping a fake clock.
 */

export type PhaseKind = 'preparation' | 'travail' | 'repos' | 'repos-round' | 'transition';

export interface TimerPhase {
  readonly id: string;
  readonly kind: PhaseKind;
  /** Planned duration in seconds. */
  readonly durationSec: number;
  readonly label: string;
  readonly sublabel?: string;
  /** Opaque payload the UI uses to render the phase (exercise id, round…). */
  readonly meta?: Record<string, unknown>;
}

export interface TimerSnapshot {
  readonly phaseIndex: number;
  readonly phase: TimerPhase | null;
  /** Seconds left in the current phase, floating point, never negative. */
  readonly remainingSec: number;
  /** 0…1 through the current phase. */
  readonly phaseProgress: number;
  /** Seconds elapsed in the whole session, excluding time spent paused. */
  readonly elapsedSec: number;
  readonly totalSec: number;
  readonly running: boolean;
  readonly finished: boolean;
}

export type TimerEvent =
  | { type: 'phase-start'; phase: TimerPhase; index: number }
  /**
   * `reason` distinguishes a phase that ran its course from one the athlete
   * cut short, and `completedSec` says how much of it was actually done —
   * without both, skipped work would be recorded as if it had been performed
   * in full.
   */
  | {
      type: 'phase-end';
      phase: TimerPhase;
      index: number;
      reason: 'elapsed' | 'skip';
      completedSec: number;
    }
  | { type: 'tick'; snapshot: TimerSnapshot }
  | { type: 'countdown'; secondsLeft: number; phase: TimerPhase }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'finished' };

export type TimerListener = (event: TimerEvent) => void;

/** Injectable wall clock — `Date.now` in production, a stub in tests. */
export type Clock = () => number;

export interface TimerOptions {
  readonly clock?: Clock;
  /** Seconds at which to emit `countdown` events (3, 2, 1 by default). */
  readonly countdownAt?: readonly number[];
}

export class TimerEngine {
  private readonly clock: Clock;
  private readonly countdownAt: readonly number[];
  private phases: TimerPhase[] = [];

  private index = 0;
  /** Absolute timestamp at which the current phase ends. */
  private deadline = 0;
  /** Seconds remaining when paused; null while running. */
  private frozenRemaining: number | null = null;
  private started = false;
  private done = false;
  /** Seconds of completed phases, so elapsed never re-derives from wall time. */
  private completedSec = 0;
  private countdownFired = new Set<number>();
  private listeners = new Set<TimerListener>();

  constructor(phases: readonly TimerPhase[], options: TimerOptions = {}) {
    this.phases = [...phases];
    this.clock = options.clock ?? (() => Date.now());
    this.countdownAt = options.countdownAt ?? [3, 2, 1];
  }

  subscribe(listener: TimerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TimerEvent) {
    for (const l of this.listeners) l(event);
  }

  get totalSec(): number {
    return this.phases.reduce((s, p) => s + p.durationSec, 0);
  }

  get currentPhase(): TimerPhase | null {
    return this.phases[this.index] ?? null;
  }

  get isRunning(): boolean {
    return this.started && this.frozenRemaining === null && !this.done;
  }

  get isFinished(): boolean {
    return this.done;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.done = false;
    this.index = 0;
    this.completedSec = 0;
    this.countdownFired.clear();
    const phase = this.currentPhase;
    if (!phase) {
      this.finish();
      return;
    }
    this.deadline = this.clock() + phase.durationSec * 1000;
    this.emit({ type: 'phase-start', phase, index: this.index });
  }

  pause(): void {
    if (!this.isRunning) return;
    this.frozenRemaining = Math.max(0, (this.deadline - this.clock()) / 1000);
    this.emit({ type: 'paused' });
  }

  resume(): void {
    if (this.frozenRemaining === null || this.done) return;
    this.deadline = this.clock() + this.frozenRemaining * 1000;
    this.frozenRemaining = null;
    this.emit({ type: 'resumed' });
  }

  togglePause(): void {
    if (this.isRunning) this.pause();
    else this.resume();
  }

  /** Jump to the next phase immediately, banking the time actually spent. */
  skip(): void {
    if (!this.started || this.done) return;
    this.advance('skip');
  }

  /** Go back to the start of the previous phase. */
  previous(): void {
    if (!this.started || this.index === 0) return;
    this.index -= 1;
    const phase = this.currentPhase;
    if (!phase) return;
    this.completedSec = Math.max(0, this.completedSec - phase.durationSec);
    this.countdownFired.clear();
    this.setPhaseDeadline(phase, this.clock());
    this.emit({ type: 'phase-start', phase, index: this.index });
  }

  /** Add or remove seconds from the phase in flight. */
  adjust(deltaSec: number): void {
    if (!this.started || this.done) return;
    if (this.frozenRemaining !== null) {
      this.frozenRemaining = Math.max(0, this.frozenRemaining + deltaSec);
    } else {
      this.deadline += deltaSec * 1000;
    }
    this.countdownFired.clear();
  }

  /** Replace the remaining phases mid-session (used by "remplacer l'exercice"). */
  replaceUpcoming(phases: readonly TimerPhase[]): void {
    this.phases = [...this.phases.slice(0, this.index + 1), ...phases];
  }

  private setPhaseDeadline(phase: TimerPhase, startedAt: number) {
    if (this.frozenRemaining !== null) this.frozenRemaining = phase.durationSec;
    else this.deadline = startedAt + phase.durationSec * 1000;
  }

  private advance(reason: 'elapsed' | 'skip') {
    const ending = this.currentPhase;
    // When a phase ends because its deadline passed, the next one is deemed to
    // have started *at that deadline* — not now. Anchoring to `now` instead
    // would make each catch-up step push its own deadline into the future, so
    // a session suspended for ten minutes would only advance by one phase.
    const previousDeadline = this.deadline;

    if (ending) {
      // Banking the planned duration keeps elapsed time equal to the sum of
      // the phases played, so an overshoot while the tab was suspended does
      // not inflate the recorded session length.
      const done =
        reason === 'skip'
          ? Math.max(0, ending.durationSec - this.remainingSec())
          : ending.durationSec;
      this.completedSec += done;
      this.emit({ type: 'phase-end', phase: ending, index: this.index, reason, completedSec: done });
    }

    this.index += 1;
    this.countdownFired.clear();
    const next = this.currentPhase;
    if (!next) {
      this.finish();
      return;
    }
    this.setPhaseDeadline(next, reason === 'elapsed' ? previousDeadline : this.clock());
    this.emit({ type: 'phase-start', phase: next, index: this.index });
  }

  private finish() {
    this.done = true;
    this.frozenRemaining = null;
    this.emit({ type: 'finished' });
  }

  private remainingSec(): number {
    if (this.done) return 0;
    if (this.frozenRemaining !== null) return this.frozenRemaining;
    if (!this.started) return this.currentPhase?.durationSec ?? 0;
    return Math.max(0, (this.deadline - this.clock()) / 1000);
  }

  /**
   * Advance the engine to the current wall-clock time.
   *
   * Safe to call at any frequency, and **required** after the app returns from
   * the background: if several phases elapsed while JavaScript was suspended,
   * they are all closed out in order so the session lands on the right phase
   * rather than resuming where it left off.
   */
  tick(): TimerSnapshot {
    if (this.started && !this.done && this.frozenRemaining === null) {
      let guard = 0;
      while (!this.done && this.clock() >= this.deadline && guard++ < 10_000) {
        this.advance('elapsed');
      }
      const phase = this.currentPhase;
      if (phase && !this.done) {
        const left = this.remainingSec();
        for (const mark of this.countdownAt) {
          if (left <= mark && left > mark - 1 && !this.countdownFired.has(mark)) {
            this.countdownFired.add(mark);
            this.emit({ type: 'countdown', secondsLeft: mark, phase });
          }
        }
      }
    }
    const snapshot = this.snapshot();
    this.emit({ type: 'tick', snapshot });
    return snapshot;
  }

  snapshot(): TimerSnapshot {
    const phase = this.currentPhase;
    const remainingSec = this.remainingSec();
    const duration = phase?.durationSec ?? 0;
    return {
      phaseIndex: this.index,
      phase,
      remainingSec,
      phaseProgress: duration > 0 ? Math.min(1, (duration - remainingSec) / duration) : 1,
      elapsedSec: this.completedSec + (this.done ? 0 : duration - remainingSec),
      totalSec: this.totalSec,
      running: this.isRunning,
      finished: this.done,
    };
  }

  /**
   * Serialisable state, so a session survives an app reload mid-workout.
   *
   * The snapshot is always *paused*: it records the seconds left rather than
   * the absolute deadline. Storing the deadline would mean that reopening the
   * app twenty minutes later fast-forwards through the rest of the session, as
   * though the athlete had been training the whole time.
   */
  serialise(): TimerPersisted {
    return {
      index: this.index,
      deadline: 0,
      frozenRemaining: this.remainingSec(),
      started: this.started,
      done: this.done,
      completedSec: this.completedSec,
    };
  }

  /** Reinstate a snapshot. The engine comes back paused; call `resume`. */
  restore(state: TimerPersisted): void {
    this.index = Math.min(Math.max(0, state.index), Math.max(0, this.phases.length - 1));
    this.started = state.started;
    this.done = state.done;
    this.completedSec = state.completedSec;
    this.countdownFired.clear();
    if (state.frozenRemaining != null) {
      this.frozenRemaining = state.frozenRemaining;
      this.deadline = 0;
    } else {
      // A snapshot from an older build carried an absolute deadline; convert
      // it to a paused remaining time rather than trusting a stale timestamp.
      this.frozenRemaining = Math.max(0, (state.deadline - this.clock()) / 1000);
      this.deadline = 0;
    }
  }

  destroy(): void {
    this.listeners.clear();
  }
}

export interface TimerPersisted {
  readonly index: number;
  readonly deadline: number;
  readonly frozenRemaining: number | null;
  readonly started: boolean;
  readonly done: boolean;
  readonly completedSec: number;
}
