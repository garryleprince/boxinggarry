import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppSettings } from '@/domain/model/user';

/**
 * Whether exercise demonstrations may animate.
 *
 * Kept in a context rather than read from the store, so `ui/` stays free of
 * application-state knowledge: the shell supplies the value, the primitives
 * consume it.
 */
const MotionContext = createContext(true);

export function MotionProvider({
  setting,
  children,
}: {
  setting: AppSettings['animations'];
  children: ReactNode;
}) {
  const [systemReduces, setSystemReduces] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystemReduces(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const animate =
    setting === 'toujours' ? true : setting === 'jamais' ? false : !systemReduces;

  return <MotionContext.Provider value={animate}>{children}</MotionContext.Provider>;
}

export const useAnimationsEnabled = (): boolean => useContext(MotionContext);
