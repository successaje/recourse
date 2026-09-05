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
| `escrow()` | `0xfDEC4B5BD29CA4e939A0CE22525B136e4641dDF1` |
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

Wired to the escrow in tx
[`0x89ce558b188613b7c1c93dc8bd9a0d1c5380d080f0a639881f6bf1fb5484b2e9`](https://sepolia.etherscan.io/tx/0x89ce558b188613b7c1c93dc8bd9a0d1c5380d080f0a639881f6bf1fb5484b2e9),
and funded with 0.02 ETH
([`0xc77824dc…6e8b`](https://sepolia.etherscan.io/tx/0xc77824dce5fecbc5bf67294af25c3707c8c87d236c6db687df09f5ae08be6e8b))
— roughly 89 verdicts at the current fee. `quote()` now returns
`224043979802768` wei; the earlier `InvalidEVMAddress` revert was only the router
refusing a zero receiver.

## Hedera testnet (296)

| Contract | Address |
| --- | --- |
| `RecourseEscrow` | `0xfDEC4B5BD29CA4e939A0CE22525B136e4641dDF1` |

Deployed in tx `0x62d4be707ea9ca91233e8ba7cc9845bc699aceac7e4f4720bfa3f7c770b01b8e`
at block 40140695, 1,799,102 gas (~1.89 HBAR at 2200 gwei).

Constructor wiring, read back from chain:

| Field | Value |
| --- | --- |
| `getRouter()` | `0x802C5F84eAD128Ff36fD6a3f8a418e339f467Ce4` |
| `sourceChainSelector()` | `16015286601757825753` (Ethereum Sepolia) |
| `verdictRelay()` | `0x005F2e3AB6C085A5240EAC5d8605D92Ba133F9DF` |
| `disputeTimeout()` | `21600` (6 hours) |
| `bondBps()` | `1000` (10%) |
| `totalCommitted()` | `0` |

`disputeTimeout` is a placeholder. It has to cover a CRE run plus CCIP finality from
Sepolia to Hedera, and when it fires a seller that might have won loses, so it wants
tightening only once the end-to-end path has actually been measured.

## Build environment

A workflow built anywhere under `/Users/finisher` picks up the stray package root at
`~/package.json` + `~/node_modules` (a hardhat/eliza install carrying **viem 1.18.2**).
The bundle compiles, then traps at engine start with
`failed to execute subscribe … wasm trap: unreachable`. Confirmed by moving that
package root aside, at which point the same workflow runs. Chainlink's own unmodified
template fails identically, so it is not specific to this project. Removing the stray
`~/package.json`, `~/node_modules` and `~/bun.lock` fixes it for every project on the
machine.
