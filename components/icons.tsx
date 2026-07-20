interface IconProps {
  className?: string;
}

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4.5 4.5h3.5l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3.5c0 1-1 2-2.5 2-8 0-15-7-15-15 0-1.5 1-2.5 2-2.5z" />
    </svg>
  );
}

export function VideoIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="6" width="12" height="12" rx="2.5" />
      <path d="M15 10.5 21 7v10l-6-3.5z" />
    </svg>
  );
}

export function ClipboardIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="5" y="4.5" width="14" height="16" rx="2.5" />
      <path d="M9 4.5V4a2 2 0 0 1 4 0v.5" />
      <path d="M8.5 11h7M8.5 15h5" />
    </svg>
  );
}

export function SmileIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" />
      <path d="M9 10h.01M15 10h.01" />
    </svg>
  );
}

export function PillIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="4" y="10.3" width="16" height="7.4" rx="3.7" transform="rotate(-45 12 14)" />
      <path d="M9.5 9.5 14.5 14.5" />
    </svg>
  );
}

export function FootprintsIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M8 4.5c1.4 0 2.5 1.3 2.5 3S9.4 12 8 12s-2.5-1.8-2.5-3.5S6.6 4.5 8 4.5z" />
      <path d="M16 10.5c1.4 0 2.5 1.3 2.5 3s-1.1 4.5-2.5 4.5-2.5-1.8-2.5-3.5 1.1-4 2.5-4z" />
      <path d="M6 14v3M18 20.5v2" />
    </svg>
  );
}

export function UtensilsIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M7 3v7a1.5 1.5 0 0 0 3 0V3M8.5 10V21M17 3c-1.7 0-3 1.8-3 5s1.3 4 3 4v9" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M5 12.5 10 17 19 7" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12.3 10.8 15 16 9.5" />
    </svg>
  );
}

export function RobotIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="4.5" y="8.5" width="15" height="11" rx="3" />
      <path d="M12 8.5V5M9.5 4.7h5" />
      <path d="M2.5 12v4M21.5 12v4" />
      <path d="M9 13.5h.01M15 13.5h.01" />
      <path d="M9.5 17h5" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.8c1.5.4 2.5 1.7 2.5 3.2 0 1.5-1 2.8-2.5 3.2" />
      <path d="M17.5 14.3c2 .6 3.5 2.6 3.5 5" />
    </svg>
  );
}

export function HeartHandIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 8.5c-1-1.7-2.7-2.5-4.3-2-2 .6-3 2.8-2.2 4.7.9 2.2 4 4.5 6.5 6 2.5-1.5 5.6-3.8 6.5-6 .8-1.9-.2-4.1-2.2-4.7-1.6-.5-3.3.3-4.3 2z" />
      <path d="M4 19.5c1.5-1 3-1.5 4.5-1.2l3 .6c1 .2 2-.1 2.7-.8l2.3-2.3" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

export function MessageIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 5.5h16v11H9.5L5 20v-3.5H4z" />
    </svg>
  );
}

export function MicIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21M9 21h6" />
    </svg>
  );
}

export function HelpIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.3c.3-1.4 1.4-2.3 2.7-2.3 1.5 0 2.7 1 2.7 2.4 0 1.8-2.5 1.9-2.7 3.6" />
      <path d="M12 16.8h.01" />
    </svg>
  );
}

export function UserCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.3 18.5c1-2.3 3.2-3.7 5.7-3.7s4.7 1.4 5.7 3.7" />
    </svg>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4.5 12 20 4.5 15 20l-3.8-6.2L4.5 12z" />
      <path d="M11.2 13.8 15 20" />
    </svg>
  );
}

export function ImageIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M4.5 17 9 12.5l3 3 3.5-4L20 17" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3.5 19 6v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9.2 12 11.3 14.2 15 9.8" />
    </svg>
  );
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4.5 7h15M9.5 7V5.2c0-.7.6-1.2 1.3-1.2h2.4c.7 0 1.3.5 1.3 1.2V7" />
      <path d="M6.5 7 7.3 19c.1.9.8 1.5 1.6 1.5h6.2c.8 0 1.5-.6 1.6-1.5L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 20c-4.5-2.7-8.5-6-8.5-10a4.7 4.7 0 0 1 8.5-2.8A4.7 4.7 0 0 1 20.5 10c0 4-4 7.3-8.5 10z" />
    </svg>
  );
}
