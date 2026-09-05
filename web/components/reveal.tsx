/**
 * Entrance fade.
 *
 * A plain element with a CSS class, and no client JavaScript at all — that is
 * the fix, not an omission.
 *
 * The previous version hid content at `opacity: 0` and raised it once an
 * IntersectionObserver fired. In a hidden or background tab that observer never
 * fires, `requestAnimationFrame` is paused, and client effects may not run, so
 * every revealed section stayed invisible indefinitely — including after the tab
 * was fronted. Observed directly: 22 reveal wrappers, all stuck at zero, content
 * present in the DOM and unreadable.
 *
 * The styling now animates *up to* a resting state that is already visible, so
 * the failure mode is a missing fade rather than a missing page. See `.reveal`
 * in globals.css.
 *
 * `delay` is accepted and ignored. Staggering requires holding elements at the
 * from-state, which reintroduces exactly the problem this removes; callers pass
 * it for readability and the uniform fade is the deliberate answer.
 */
export function Reveal({
  children,
  delay: _delay = 0,
  onMount: _onMount = false,
}: {
  children: React.ReactNode;
  delay?: number;
  onMount?: boolean;
}) {
  return <div className="reveal">{children}</div>;
}
