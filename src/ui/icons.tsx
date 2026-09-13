/** Inline stroke icons. Kept minimal and consistent: 24px grid, 1.8 stroke. */

type IconProps = { size?: number; className?: string };

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
});

export const IconToday = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3 4 8v8l8 5 8-5V8z" />
    <path d="M12 11v6" />
  </svg>
);

export const IconCalendar = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const IconTimer = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </svg>
);

export const IconChart = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const IconLibrary = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 5h6v14H4zM14 5h6v14h-6zM14 10h6" />
  </svg>
);

export const IconSettings = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
  </svg>
);

export const IconPlay = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const IconPause = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="4" height="14" rx="1.4" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.4" />
  </svg>
);

export const IconSkip = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 5l9 7-9 7zM18 5v14" />
  </svg>
);

export const IconBack = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);

export const IconClose = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconSwap = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
);

export const IconHeart = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" />
  </svg>
);

export const IconFlame = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3s4 4 4 7a4 4 0 0 1-8 0c0-1 .5-2 1-2.5 0 1.6 1 2.5 1 2.5s.5-4 2-7z" />
    <path d="M7 14a5 5 0 0 0 10 0" />
  </svg>
);

export const IconCheck = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const IconPlus = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconLock = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="4" y="10" width="16" height="11" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export const IconGlove = ({ size = 22, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 9a3 3 0 0 1 6 0v2M12 8.5a2.5 2.5 0 0 1 5 0V13a5 5 0 0 1-5 5H9a3 3 0 0 1-3-3V9" />
    <path d="M6 18.5h11" />
  </svg>
);
