'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RobotIcon, UsersIcon, ClipboardIcon, HeartHandIcon } from '@/components/icons';

const NAV_ITEMS = [
  { href: '/', label: 'Assistant', Icon: RobotIcon },
  { href: '/family', label: 'Family', Icon: UsersIcon },
  { href: '/reminders', label: 'Reminders', Icon: ClipboardIcon },
  { href: '/care', label: 'Care', Icon: HeartHandIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 bg-canvas/95 backdrop-blur border-t border-navy/5 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <div className="max-w-2xl mx-auto flex items-center justify-around">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-full transition-colors ${
                active ? 'bg-mint-soft' : ''
              }`}
            >
              <Icon className={`w-6 h-6 ${active ? 'text-mint' : 'text-ink-faint'}`} />
              <span className={`text-xs font-medium ${active ? 'text-navy' : 'text-ink-faint'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
