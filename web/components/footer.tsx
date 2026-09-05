import Link from 'next/link';
import { ESCROW, RELAY } from '@/lib/constants';

export function Footer() {
  return (
    <footer className="border-line mt-32 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-text text-[15px] font-600">Recourse</p>
          <p className="text-text-3 mt-2 max-w-[28ch] text-[13.5px] leading-relaxed">
            Escrow and dispute resolution for payments made by machines.
          </p>
        </div>

        <div>
          <p className="label mb-3">Protocol</p>
          <ul className="space-y-2 text-[13.5px]">
            <li>
              <Link href="/protocol" className="text-text-2 hover:text-brass transition-colors">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/explorer" className="text-text-2 hover:text-brass transition-colors">
                Explorer
              </Link>
            </li>
            <li>
              <Link href="/build" className="text-text-2 hover:text-brass transition-colors">
                Integrate
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="label mb-3">Deployments</p>
          <ul className="mono space-y-2 text-[12.5px]">
            <li>
              <a
                href={ESCROW.explorer}
                target="_blank"
                rel="noreferrer"
                className="text-text-2 hover:text-brass transition-colors"
              >
                Escrow · Hedera
              </a>
            </li>
            <li>
              <a
                href={RELAY.explorer}
                target="_blank"
                rel="noreferrer"
                className="text-text-2 hover:text-brass transition-colors"
              >
                Relay · Sepolia
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="label mb-3">Status</p>
          <p className="text-text-3 text-[13.5px] leading-relaxed">
            Testnet. Contracts are unaudited and the escrow holds testnet value only.
          </p>
        </div>
      </div>

      <div className="border-line-soft border-t">
        <div className="text-text-3 mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-6 py-5 text-[12.5px]">
          <span>ETHOnline 2026</span>
          <span className="text-line">·</span>
          <span>Hedera · Chainlink CRE · Bazantic</span>
        </div>
      </div>
    </footer>
  );
}
