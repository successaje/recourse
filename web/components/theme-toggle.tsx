'use client';

import { useEffect, useState } from 'react';

/**
 * Light / dark switch.
 *
 * The stored choice is applied by an inline script in the document head, before
 * first paint — see `layout.tsx`. Doing it here in an effect would mean a frame
 * of dark on a light-theme reload, which is the flash every theme toggle is
 * judged by.
 *
 * This component only reflects and updates that state. It renders nothing until
 * mounted, because the server cannot know which theme a given reader chose and
 * rendering a guess produces a hydration mismatch and a visibly wrong icon.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (next === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('recourse-theme', next);
    } catch {
      // Private browsing, or storage disabled. The toggle still works for this
      // page view; it just will not be remembered.
    }
  }

  // Reserve the space so the nav does not shift when this appears.
  if (theme === null) return <span className="h-8 w-8" aria-hidden />;

  return (
    <button
      onClick={toggle}
      className="border-line text-text-3 hover:border-brass-dim hover:text-text flex h-8 w-8 items-center justify-center rounded border transition-colors"
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      {theme === 'light' ? (
        /* moon */
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M13.5 9.9A6 6 0 0 1 6.1 2.5a6 6 0 1 0 7.4 7.4Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        /* sun */
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
