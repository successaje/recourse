'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/protocol', label: 'Protocol' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/services', label: 'Services' },
  { href: '/agent', label: 'Agent' },
  { href: '/build', label: 'Build' },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-ink/85 border-line backdrop-blur-md' : 'border-transparent'
      } border-b`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <Mark />
          <span className="font-display text-[15px] font-600 tracking-tight">Recourse</span>
        </Link>

        <div className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-3 py-1.5 text-[13.5px] transition-colors ${
                  active ? 'text-text' : 'text-text-3 hover:text-text-2'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <a
            href="https://github.com/successaje/recourse"
            target="_blank"
            rel="noreferrer"
            className="border-line text-text-2 hover:border-brass-dim hover:text-text ml-2 rounded border px-3 py-1.5 text-[13.5px] transition-colors"
          >
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}

/**
 * The mark is the mechanism: a full circle (the payment) with a wedge held back.
 * Escrow in one glyph.
 */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8.25" stroke="var(--color-brass)" strokeWidth="1.5" />
      <path
        d="M10 1.75 A8.25 8.25 0 0 1 18.25 10 L10 10 Z"
        fill="var(--color-brass)"
        fillOpacity="0.9"
      />
    </svg>
  );
}
