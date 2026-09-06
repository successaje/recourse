/**
 * Powered by.
 *
 * These are typographic marks, not the sponsors' official logo files. Drawing a
 * lookalike of someone else's logo is worse than not showing one — it
 * misrepresents their brand, and on a site whose whole argument is that nothing
 * here is fabricated it would be the one fabricated thing.
 *
 * To use the real assets, drop each SVG into `web/public/logos/` and swap the
 * `mark` for an <img>. The ℏ is a genuine Unicode character (U+210F), not a
 * trace of Hedera's logo, so it is used as-is.
 *
 * Each entry names what the technology actually does here. A row of logos says
 * "we used these"; naming the role says "here is the third of the system each
 * one holds up", which is the claim worth making.
 */

interface Sponsor {
  name: string;
  role: string;
  detail: string;
  href: string;
  mark: React.ReactNode;
}

const SPONSORS: Sponsor[] = [
  {
    name: 'Hedera',
    role: 'Escrow and settlement',
    detail: 'Live x402 payments settled through Blocky402 into a contract that holds them.',
    href: 'https://hedera.com',
    mark: (
      <span className="font-display text-brass text-[22px] leading-none" aria-hidden>
        ℏ
      </span>
    ),
  },
  {
    name: 'Chainlink CRE',
    role: 'Confidential adjudication',
    detail: 'A TEE handler judges the disputed payload inside an enclave; CCIP carries the verdict.',
    href: 'https://docs.chain.link/cre',
    mark: (
      <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden>
        <path
          d="M10 1.5 18 6v10l-8 4.5L2 16V6l8-4.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          className="text-enclave"
        />
      </svg>
    ),
  },
  {
    name: 'Bazantic',
    role: 'Agent gateway',
    detail: 'The whole flow republished so any agent can ask whether a response honoured its SLA.',
    href: 'https://bazantic.com',
    mark: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="2.2" y="2.2" width="15.6" height="15.6" rx="3.4" stroke="currentColor" strokeWidth="1.4" className="text-text-2" />
        <circle cx="10" cy="10" r="3" fill="currentColor" className="text-brass" />
      </svg>
    ),
  },
];

export function Sponsors() {
  return (
    <section className="border-line border-t">
      <div className="shell">
        <p className="label">Built on</p>
        <h2 className="mt-4 max-w-[24ch] text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">
          Three sponsors, three load-bearing roles
        </h2>
        <p className="text-text-2 mt-4 max-w-[60ch] text-[15.5px] leading-relaxed">
          Each holds up a different third of the system, so none of them is a logo bolted
          onto a project that would work without it.
        </p>

        <ul className="mt-10 grid gap-4 lg:grid-cols-3">
          {SPONSORS.map((s) => (
            <li key={s.name}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="border-line bg-surface/40 hover:border-brass-dim group flex h-full flex-col rounded-lg border p-6 transition-colors"
              >
                <span className="flex h-8 items-center">{s.mark}</span>
                <span className="text-text mt-4 text-[16px]">{s.name}</span>
                <span className="text-brass mt-1 text-[13px]">{s.role}</span>
                <span className="text-text-3 mt-3 text-[13.5px] leading-relaxed">{s.detail}</span>
                <span className="text-text-3 group-hover:text-text-2 mt-5 text-[12.5px] transition-colors">
                  Learn more ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Compact row for under the hero. */
export function SponsorStrip() {
  return (
    <div className="text-text-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
      <span>Powered by</span>
      {SPONSORS.map((s, i) => (
        <span key={s.name} className="flex items-center gap-2">
          <span className="flex h-4 w-5 items-center justify-center">{s.mark}</span>
          <span className="text-text-2">{s.name}</span>
          {i < SPONSORS.length - 1 && <span className="text-line ml-3">·</span>}
        </span>
      ))}
    </div>
  );
}
