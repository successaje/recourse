import { short } from '@/lib/format';

/**
 * An address, shown by its ENS name when it has one.
 *
 * The name is a label and never an identity. The address stays visible
 * underneath rather than being replaced, because the payment is bound to the
 * address and a reader checking a transaction needs the thing that was actually
 * signed, not a nickname that resolution could change tomorrow.
 */
export function AddressLabel({
  address,
  ensName,
  className = '',
  short: useShort = true,
}: {
  address: string;
  ensName?: string | null;
  className?: string;
  short?: boolean;
}) {
  if (!ensName) {
    return (
      <span className={`mono ${className}`}>{useShort ? short(address, 6, 4) : address}</span>
    );
  }

  return (
    <span className={className}>
      <span className="text-text">{ensName}</span>
      <span className="mono text-text-3 ml-2 text-[0.85em]">{short(address, 6, 4)}</span>
    </span>
  );
}
