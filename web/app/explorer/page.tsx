import type { Metadata } from 'next';
import { ExplorerTable } from '@/components/explorer-table';
import { ESCROW } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Explorer',
  description: 'Live escrow activity on Hedera testnet: payments, disputes and verdicts.',
};

export default function ExplorerPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-8">
      <p className="label">Live · Hedera testnet</p>
      <h1 className="mt-4 text-[clamp(1.9rem,4vw,2.6rem)] leading-tight">Explorer</h1>
      <p className="text-text-2 mt-4 max-w-[62ch] text-[16px] leading-relaxed">
        Every payment the escrow has held, assembled from its own events. A row moves
        from protected to released or refunded as the protocol runs, and a refunded payment names the
        clause that failed rather than reporting a bare error.
      </p>

      <p className="text-text-3 mono mt-5 text-[12.5px]">
        <a href={ESCROW.explorer} target="_blank" rel="noreferrer" className="hover:text-brass transition-colors">
          {ESCROW.address} · {ESCROW.accountId}
        </a>
      </p>

      <ExplorerTable />
    </div>
  );
}
