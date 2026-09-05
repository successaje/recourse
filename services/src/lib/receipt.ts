/**
 * Response receipts.
 *
 * The seller signs a hash of exactly what it returned. That signature is what
 * lets a buyer open a dispute at all, and it is the reason neither side can lie
 * about the delivery: the seller fixed the hash, the buyer supplies the bytes,
 * and the enclave only judges a case where the two agree.
 *
 * The digest must match `RecourseEscrow.receiptDigest` byte for byte, or
 * `dispute()` reverts with `BadSignature`.
 */

import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toBytes,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { ESCROW_EVM_ADDRESS, HEDERA_CHAIN_ID } from './config.js';

/** `keccak256` of the raw response bytes, exactly as sent. */
export function responseHash(body: string): Hex {
  return keccak256(toBytes(body));
}

/**
 * The inner digest, before the EIP-191 prefix.
 *
 * Domain-separated by escrow address and chain id so a receipt signed for one
 * deployment cannot be replayed against another.
 */
export function receiptPreimage(
  paymentId: Hex,
  respHash: Hex,
  escrow: Address = ESCROW_EVM_ADDRESS,
  chainId: number = HEDERA_CHAIN_ID,
): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters('address, uint256, bytes32, bytes32'), [
      escrow,
      BigInt(chainId),
      paymentId,
      respHash,
    ]),
  );
}

/**
 * Sign a receipt.
 *
 * Signs the preimage as a raw 32-byte message, which applies the same EIP-191
 * prefix the contract's `toEthSignedMessageHash()` expects.
 */
export async function signReceipt(
  privateKey: Hex,
  paymentId: Hex,
  body: string,
): Promise<{ responseHash: Hex; signature: Hex; signer: Address }> {
  const account = privateKeyToAccount(privateKey);
  const respHash = responseHash(body);
  const signature = await account.signMessage({
    message: { raw: receiptPreimage(paymentId, respHash) },
  });
  return { responseHash: respHash, signature, signer: account.address };
}
