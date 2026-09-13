/**
 * Release an uncontested payment to the seller.
 *
 * The path a purchase takes when nothing goes wrong, and the one the escrow is
 * built to make cheap: no oracle, no adjudication, one call after the window
 * lapses. Separate from the buyer agent because anyone may trigger it — the
 * funds can only reach the seller named at `bind`.
 */

import type { Hex } from 'viem';

import { ESCROW_EVM_ADDRESS, normalizePrivateKey } from './lib/config.js';
import { PaymentState, publicClient, readPayment, release } from './lib/escrow.js';

const paymentId = process.argv[2] as Hex | undefined;
const rawKey = process.env['BUYER_PRIVATE_KEY'];

if (!paymentId || !rawKey) {
  console.error('usage: BUYER_PRIVATE_KEY=0x… bun run src/release.ts <paymentId>');
  process.exit(1);
}

const payment = await readPayment(paymentId);
if (payment.state !== PaymentState.Funded) {
  console.error(`payment is in state ${payment.state}, expected Funded`);
  process.exit(1);
}

console.log(`seller ${payment.seller}, amount ${payment.amount} tinybar`);

const before = await publicClient.getBalance({ address: payment.seller });

// `release` reverts with WindowOpen until the deadline has actually passed, and
// the chain's clock is the only one that counts here.
for (;;) {
  const block = await publicClient.getBlock();
  const remaining = Number(payment.deadline) - Number(block.timestamp);
  if (remaining <= 0) break;
  console.log(`  window closes in ${remaining}s`);
  await new Promise((r) => setTimeout(r, Math.min(remaining, 20) * 1000));
}

const tx = await release(normalizePrivateKey(rawKey, 'BUYER_PRIVATE_KEY'), paymentId);
const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
console.log(`released: ${tx} (block ${receipt.blockNumber})`);

const after = await publicClient.getBalance({ address: payment.seller });
const settled = await readPayment(paymentId);

console.log(`state:        ${settled.state} (4 = Settled)`);
console.log(`seller delta: +${Number(after - before) / 1e18} HBAR`);
console.log(`escrow left:  ${await publicClient.getBalance({ address: ESCROW_EVM_ADDRESS })}`);
