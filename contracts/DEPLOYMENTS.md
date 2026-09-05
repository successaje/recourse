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

## First end-to-end run — 5 Sep 2026

A real x402 payment, adjudicated in an enclave, with the verdict dispatched
cross-chain. Every step below happened on live testnets.

| Step | Evidence |
| --- | --- |
| x402 settlement into escrow | Hedera tx `0.0.7162784@1788621760.953765842` |
| `bind` | `0x9610a95f2cbe39e1ab96176abcd9be723eb1656d362a1333d0c6bd6330079425` |
| Seller served + signed a receipt | responseHash `0xaa47e3590af187621b06c09574ed0b01ea7da6bbed9c360e139569fb2a515bde` |
| `dispute` | payment `0xd382d7204f3e1828052297525c441f22cd110e489d21807b69d432bd54f45dd7`, bond 1e6 tinybar |
| Enclave verdict | `REJECT reason=102` |
| Report written to Sepolia | [`0xd56fbd31…48bfd`](https://sepolia.etherscan.io/tx/0xd56fbd31cc0a6bb96fec8c0c4a5ba37598d9c2fd90b66f84c4f24ef6bef48bfd), 217,047 gas |
| CCIP message | `0x9ee1905c3c96ca7cc091ed85bc333cbb3a2d0a0a1db009d964e42d6ba25f35ba` |
| CCIP fee actually paid | 224,259,624,325,870 wei, within 0.1% of the quote |

Reason 102 is `ASSERTION_OFFSET + 2` — clause 2, `numeric.gt` on `$.bid`, which is
exactly the rule the seller broke when asked for a negative bid. The refund is
therefore attributable to a specific published promise rather than a judgement call.

**Delivery on Hedera was still pending 16 minutes after dispatch**; the payment
remained in state 2 (Disputed). CCIP waits for source-chain finality, and Sepolia
takes roughly two epochs, so some of that is expected. Track the message at
[ccip.chain.link](https://ccip.chain.link) by the id above. If it lands as failed
rather than pending, the first thing to check is the destination gas limit — the
relay sends 300,000, and `_ccipReceive` does a state transition plus a native
transfer to the winner.

### Hedera unit trap

Inside the EVM, HBAR is tinybars: `address(this).balance`, `msg.value` and
`call{value:}` all agree, so the escrow's accounting is self-consistent. A
transaction submitted over JSON-RPC carries `value` in **weibars**, which the relay
divides by 10^10 before the EVM sees it. Sending a tinybar amount as a raw tx value
underpays by ten orders of magnitude; it surfaced here as `BondTooSmall`, which
names nothing useful. Clients must scale, contracts must not.

### Relay lag

Hedera's JSON-RPC relay trails consensus, so the buyer waits three times: for the
deposit to be visible before `bind`, for the bound state before the seller will
serve, and for the dispute receipt so the adjudicator pins its read to the block
the dispute actually landed in.
