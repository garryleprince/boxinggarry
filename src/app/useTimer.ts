import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '@/domain/model/user';
import {
  TimerEngine,
  type TimerEvent,
  type TimerPersisted,
  type TimerPhase,
  type TimerSnapshot,
} from '@/engines/timer/engine';
import { AudioCoach, type CueKind } from '@/engines/timer/audio';

/**
 * React binding for the timer engine.
 *
 * The engine owns the time; this hook owns the rendering cadence and the
 * lifecycle concerns the browser imposes — re-synchronising when the app comes
 * back to the foreground, and re-acquiring the screen wake lock that iOS drops
 * on backgrounding.
 */

export interface UseTimerOptions {
  phases: readonly TimerPhase[];
  settings: AppSettings;
  autoStart?: boolean;
  /** A snapshot to reinstate instead of starting from the first phase. */
  restoreFrom?: TimerPersisted | null;
  onPhaseStart?(phase: TimerPhase, index: number): void;
  onPhaseEnd?(
    phase: TimerPhase,
    index: number,
    detail: { reason: 'elapsed' | 'skip'; completedSec: number },
  ): void;
  onFinished?(): void;
}

const cueForPhase = (phase: TimerPhase): CueKind => {
  switch (phase.kind) {
    case 'travail':
      return 'debut';
    case 'repos':
    case 'repos-round':
      return 'repos';
    default:
      return 'transition';
  }
};

export function useTimer({
  phases,
  settings,
  autoStart = false,
  restoreFrom = null,
  onPhaseStart,
  onPhaseEnd,
  onFinished,
}: UseTimerOptions) {
  const audio = useMemo(() => new AudioCoach(settings), []);
  const engine = useMemo(
    () => new TimerEngine(phases, { countdownAt: [3, 2, 1] }),
    // Phases are fixed for the life of a session screen.
    [phases],
  );
  const [snapshot, setSnapshot] = useState<TimerSnapshot>(() => engine.snapshot());
  const handlers = useRef({ onPhaseStart, onPhaseEnd, onFinished });
  handlers.current = { onPhaseStart, onPhaseEnd, onFinished };

  useEffect(() => {
    audio.update(settings);
  }, [audio, settings]);

  useEffect(() => {
    const off = engine.subscribe((event: TimerEvent) => {
      switch (event.type) {
        case 'phase-start':
          audio.cue(cueForPhase(event.phase));
          handlers.current.onPhaseStart?.(event.phase, event.index);
          break;
        case 'phase-end':
          handlers.current.onPhaseEnd?.(event.phase, event.index, {
            reason: event.reason,
            completedSec: event.completedSec,
          });
          break;
        case 'countdown':
          audio.cue('compte-a-rebours');
          break;
        case 'finished':
          audio.cue('seance-terminee');
          handlers.current.onFinished?.();
          break;
        default:
          break;
      }
    });
    return off;
  }, [engine, audio]);

  // Render loop. requestAnimationFrame keeps the progress arc smooth and stops
  // automatically when the tab is hidden, which is exactly what we want: the
  // engine recomputes from timestamps on the way back.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setSnapshot(engine.tick());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // Coming back from the background: resynchronise immediately rather than
  // waiting for the next animation frame, and take the wake lock back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setSnapshot(engine.tick());
      void audio.reacquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [engine, audio]);

  useEffect(() => {
    return () => {
      void audio.dispose();
      engine.destroy();
    };
  }, [engine, audio]);

  /**
   * Must be triggered by a user gesture: iOS unlocks audio only from one.
   * Reinstates a saved snapshot when there is one, so resuming continues where
   * the session stopped rather than restarting it.
   */
  const begin = useCallback(async () => {
    await audio.unlock();
    await audio.requestWakeLock();
    if (restoreFrom?.started && !restoreFrom.done) {
      engine.restore(restoreFrom);
      engine.resume();
    } else {
      engine.start();
    }
    setSnapshot(engine.tick());
  }, [engine, audio, restoreFrom]);

  useEffect(() => {
    if (autoStart) void begin();
  }, [autoStart, begin]);

  return {
    engine,
    audio,
    snapshot,
    begin,
    pause: useCallback(() => engine.pause(), [engine]),
    resume: useCallback(() => engine.resume(), [engine]),
    toggle: useCallback(() => engine.togglePause(), [engine]),
    skip: useCallback(() => engine.skip(), [engine]),
    previous: useCallback(() => engine.previous(), [engine]),
    adjust: useCallback((sec: number) => engine.adjust(sec), [engine]),
  };
}
