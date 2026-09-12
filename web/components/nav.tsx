'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close on navigation, so tapping a link does not leave the sheet open over
  // the page it just went to.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

        {/* Five links, a button and a toggle do not fit a phone. Below md the
            links collapse into a sheet and only the mark, the toggle and the
            menu button stay on the bar. */}
        <div className="hidden items-center gap-1 md:flex">
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
            className="border-line text-text-2 hover:border-brass-dim hover:text-text ml-2 mr-2 rounded border px-3 py-1.5 text-[13.5px] transition-colors"
          >
            GitHub
          </a>
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="border-line text-text-2 hover:border-brass-dim hover:text-text flex h-8 w-8 items-center justify-center rounded border transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              {open ? (
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-nav" className="border-line bg-ink/95 border-t backdrop-blur-md md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-6 py-3">
            {LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`border-line-soft border-b py-3 text-[15px] transition-colors last:border-0 ${
                    active ? 'text-brass' : 'text-text-2'
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
              className="text-text-3 py-3 text-[15px]"
            >
              GitHub ↗
            </a>
          </div>
        </div>
      )}
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
