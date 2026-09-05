/**
 * Escrow client.
 *
 * Reads and writes `RecourseEscrow` on Hedera testnet over its JSON-RPC relay.
 * Hedera exposes a normal EVM surface here, so viem works unchanged — the only
 * Hedera-specific detail lives in `bind`'s reason for existing, documented below.
 */

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { ESCROW_EVM_ADDRESS, HEDERA_CHAIN_ID } from './config.js';

export const hederaTestnet = defineChain({
  id: HEDERA_CHAIN_ID,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hashio.io/api'] } },
});

/** Mirrors `RecourseEscrow.State`. */
export const PaymentState = {
  None: 0,
  Funded: 1,
  Disputed: 2,
  ReceiptChallenged: 3,
  Settled: 4,
} as const;

export const ESCROW_ABI = [
  {
    type: 'function',
    name: 'getPayment',
    stateMutability: 'view',
    inputs: [{ name: 'paymentId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'buyer', type: 'address' },
          { name: 'seller', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'bond', type: 'uint256' },
          { name: 'slaHash', type: 'bytes32' },
          { name: 'responseHash', type: 'bytes32' },
          { name: 'deadline', type: 'uint64' },
          { name: 'wasChallenged', type: 'bool' },
          { name: 'state', type: 'uint8' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'unboundBalance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'requiredBond',
    stateMutability: 'view',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'bind',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'seller', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'slaHash', type: 'bytes32' },
      { name: 'window', type: 'uint64' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'dispute',
    stateMutability: 'payable',
    inputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'responseHash', type: 'bytes32' },
      { name: 'sellerSig', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'challengeReceipt',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'paymentId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

export const publicClient = createPublicClient({
  chain: hederaTestnet,
  transport: http(),
});

export function walletFor(privateKey: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: hederaTestnet,
    transport: http(),
  });
}

export interface Payment {
  buyer: Address;
  seller: Address;
  amount: bigint;
  bond: bigint;
  slaHash: Hex;
  responseHash: Hex;
  deadline: bigint;
  wasChallenged: boolean;
  state: number;
}

export async function readPayment(paymentId: Hex): Promise<Payment> {
  const p = await publicClient.readContract({
    address: ESCROW_EVM_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'getPayment',
    args: [paymentId],
  });
  return p as unknown as Payment;
}

export function requiredBond(amount: bigint) {
  return publicClient.readContract({
    address: ESCROW_EVM_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'requiredBond',
    args: [amount],
  });
}

export function unboundBalance() {
  return publicClient.readContract({
    address: ESCROW_EVM_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'unboundBalance',
  });
}

/**
 * Attach terms to a settlement that has already landed.
 *
 * Separate from paying because a native Hedera transfer credits a contract's
 * balance without running any of its code — the escrow cannot be notified by the
 * payment itself, so the buyer commits the terms in a second transaction. The
 * contract will only bind funds it can prove it already holds.
 */
export async function bind(
  privateKey: Hex,
  args: { paymentId: Hex; seller: Address; amount: bigint; slaHash: Hex; window: bigint },
) {
  const wallet = walletFor(privateKey);
  return wallet.writeContract({
    address: ESCROW_EVM_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'bind',
    args: [args.paymentId, args.seller, args.amount, args.slaHash, args.window],
  });
}

/**
 * Hedera denominates HBAR differently either side of the JSON-RPC boundary.
 *
 * Inside the EVM everything is tinybars: `address(this).balance`, `msg.value` and
 * `call{value:}` all agree, so the contract's own accounting is self-consistent.
 * A transaction submitted over JSON-RPC, though, carries `value` in weibars, and
 * the relay divides by this factor before the EVM sees it. Sending a tinybar
 * amount as the raw tx value therefore underpays by ten orders of magnitude —
 * which surfaces as `BondTooSmall` rather than anything that names the cause.
 */
export const WEIBARS_PER_TINYBAR = 10n ** 10n;

/** Contest a response, presenting the seller's own signed receipt plus a bond. */
export async function dispute(
  privateKey: Hex,
  args: { paymentId: Hex; responseHash: Hex; sellerSig: Hex; bond: bigint },
) {
  const wallet = walletFor(privateKey);
  return wallet.writeContract({
    address: ESCROW_EVM_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'dispute',
    args: [args.paymentId, args.responseHash, args.sellerSig],
    // `bond` comes from `requiredBond()` and is therefore in tinybars.
    value: args.bond * WEIBARS_PER_TINYBAR,
  });
}

/** Claim the seller never handed over a signed receipt. */
export async function challengeReceipt(privateKey: Hex, paymentId: Hex) {
  const wallet = walletFor(privateKey);
  return wallet.writeContract({
    address: ESCROW_EVM_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'challengeReceipt',
    args: [paymentId],
  });
}
