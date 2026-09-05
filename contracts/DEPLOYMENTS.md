# Deployments

## Ethereum Sepolia (11155111)

| Contract | Address |
| --- | --- |
| `VerdictRelay` | [`0x005F2e3AB6C085A5240EAC5d8605D92Ba133F9DF`](https://sepolia.etherscan.io/address/0x005F2e3AB6C085A5240EAC5d8605D92Ba133F9DF) |

Deployed in tx [`0x96b53859f6e30674ce7a27599568ba3c37e8176860e55a7bbbf7e91f5854bf1d`](https://sepolia.etherscan.io/tx/0x96b53859f6e30674ce7a27599568ba3c37e8176860e55a7bbbf7e91f5854bf1d)
at block 11640308, 1,180,166 gas.

Constructor wiring, read back from chain:

| Field | Value |
| --- | --- |
| `owner` | `0xC282Cb7cE6c175582B84BF94C61258Bb5cDCA88e` |
| `getForwarder()` | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| `router()` | `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` |
| `destinationChainSelector()` | `222782988166878823` (Hedera testnet) |
| `escrow()` | `0x0000…0000` — not yet deployed |
| `destinationGasLimit()` | `300000` |

### Why the mock forwarder

`0x15fC…f9f88` is the CRE **mock** forwarder, which is what
`cre workflow simulate --broadcast` delivers reports through. The production
forwarder on Sepolia is `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`; switch with
`setForwarder` once the workflow is deployed rather than simulated.

### Measured CCIP fee

A verdict message to Hedera testnet with a 300k destination gas limit quotes at
**224,493,863,864,944 wei (~0.000224 ETH)** from the live Sepolia router. The relay
pays fees from its own balance, so it has to be funded before it can forward
anything — it currently holds 0.

### Known state

`quote()` on the relay reverts with `InvalidEVMAddress(bytes)` (`0x8d666f60`) while
`escrow()` is the zero address: the router rejects a zero receiver. This resolves
itself once `setDestination` points at the deployed Hedera escrow. The fee above was
measured by calling the router directly with a non-zero receiver and the relay's exact
message shape.

## Hedera testnet (296)

`RecourseEscrow` — not deployed. The deployer holds 0 HBAR; needs funding from the
Hedera portal faucet.
