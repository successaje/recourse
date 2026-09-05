# Recourse

**x402 pays before delivery. Recourse is the part that gets your money back.**

An escrow and dispute layer for agentic payments, adjudicated inside a Chainlink
CRE enclave and settled on Hedera.

---

## The gap

The x402 standard gives an agent a clean way to pay for an HTTP request: hit an
endpoint, get a `402` with a price, sign a payment, retry. It works, and this
hackathon will produce hundreds of services that speak it.

Every one of them shares the same hole. **Settlement happens before the response
is generated.** A seller that returns an empty object, a stale quote, or a
confidently wrong number keeps the money.

A human notices and stops buying. An agent making thousands of calls an hour does
not notice, has no refund path, and will keep paying for garbage until someone
reads a log.

Recourse changes one thing: the payment lands in an escrow instead of the
seller's account. Everything else is about deciding who gets it.

## What it does

1. A seller publishes a **machine-checkable SLA** and quotes its hash in the `402`.
2. The buyer settles into an **escrow on Hedera** and binds the deposit to those
   exact terms on-chain.
3. The seller serves the response with a **signature over what it sent**.
4. If the response breaks the SLA, the buyer disputes with a bond.
5. A **Chainlink CRE enclave** re-reads the payment from chain, pulls the evidence
   over confidential HTTP, and rules — deterministically.
6. The verdict crosses to Hedera over **CCIP** and the escrow pays the winner.

The uncontested path never touches an oracle: one extra contract call, and the
seller withdraws. Adjudication is the exception, and only the exception pays for it.

## It works. Here is the proof.

Both paths, end to end, on live testnets.

**A bad response, refunded** — the seller returned a negative bid, breaking clause 2:

| Step | Evidence |
| --- | --- |
| x402 settlement into escrow | Hedera `0.0.7162784@1788624601.728920938` |
| Dispute opened | payment `0xc79c411d…0991` |
| Enclave verdict | `REJECT reason=102` |
| Report written to Sepolia | [`0x98d8c558…2ec7`](https://sepolia.etherscan.io/tx/0x98d8c5584c793b0b76643c5233995b2e09fc04def6cda68b6a7b31440af72ec7) |
| CCIP message | `0xa4fb4823…db84` |
| **Buyer refunded** | **+0.11 HBAR** — the payment *and* the bond |

`102` is `ASSERTION_OFFSET + 2`: clause 2, `numeric.gt` on `$.bid`. The refund
points at a specific published promise, not a judgement call.

**An honest response, paid** — all five clauses held:

| Step | Evidence |
| --- | --- |
| Purchase | Hedera `0.0.7162784@1788626670.841803967` |
| Release | `0x7fbd0eb1…316a` |
| **Seller paid** | **+0.1 HBAR**, one call, no oracle |

Solvency checked live afterwards and exact: escrow balance 11,000,000 tinybar =
`totalCommitted`, `unboundBalance` 0.

## Deployments

| Contract | Network | Address |
| --- | --- | --- |
| `RecourseEscrow` | Hedera testnet (296) | `0x7E7A73e5bE1F45D9B3033C2a96087B62855e00bB` (`0.0.10380390`) |
| `VerdictRelay` | Ethereum Sepolia | [`0x005F2e3AB6C085A5240EAC5d8605D92Ba133F9DF`](https://sepolia.etherscan.io/address/0x005F2e3AB6C085A5240EAC5d8605D92Ba133F9DF) |

Full record, including every transaction hash: [`contracts/DEPLOYMENTS.md`](contracts/DEPLOYMENTS.md).

## The three hard problems

### 1. Neither side can lie about what was delivered

The question a judge asks first, and where most escrow designs fall over. If the
buyer supplies the disputed response, they can paste in garbage. If the seller
supplies it, they can produce an answer they never sent.

The seller signs `paymentId ‖ keccak(body)` alongside the response. To dispute,
the buyer must present that signature — so **the hash is fixed by the seller and
the bytes come from the buyer**, and the enclave judges only a case where the two
agree. Neither party is trusted and no witness is paid.

A seller that withholds the signature gains nothing: `challengeReceipt` opens a
grace period, and silence refunds the buyer.

### 2. The judge cannot be a language model

The instinct is to put an LLM in the enclave. That breaks the protocol — the
enclave result is attested and verified by DON consensus, which requires the same
input to produce the same output every time.

So the model moves upstream, where non-determinism is free: it helps a seller
author a machine-checkable SLA, content-addressed and agreed before any money
moves. The enclave then does something more defensible than judging — it
**enforces a contract both sides already signed**.

"Trust our model" invites the obvious question. "Deterministic, attested, and
reproducible by anyone" does not.

### 3. Confidentiality is why it needs a TEE

Adjudication requires reading the disputed payload — exactly the thing a buyer
paid to keep private. Publishing it to settle a fifty-cent argument is worse than
eating the loss.

Only `(paymentId, verdict, reasonCode)` leaves the enclave. Note what is *not*
claimed: the workflow binary is public, so the **rules are auditable and only the
data is sealed**. That is the right way round.

## Architecture

```
buyer agent ──402──> seller (x402, Hedera)
     │                   │
     │ settle            │ signs keccak(body)
     ▼                   ▼
RecourseEscrow (Hedera) ◄── bind ── terms committed on-chain
     │
     │ dispute + bond
     ▼
CRE enclave (AWS Nitro) ── reads payment by eth_call, evidence over confidential HTTP
     │
     │ writeReport
     ▼
VerdictRelay (Sepolia) ──CCIP──> RecourseEscrow ──> refund or release
```

Two shapes are forced by platform limits rather than preference, and both are
worth knowing before reading the code:

- **CRE cannot write to Hedera.** Of the 57 chains a CRE tenant can target,
  Hedera is not one. The enclave writes to Sepolia, where a forwarder verifies
  the DON signatures, and CCIP carries the verdict the rest of the way.
- **CRE cannot watch Hedera either**, so nothing can subscribe to `DisputeOpened`.
  The adjudicator sweeps a queue instead. That queue is untrusted by design: the
  enclave re-reads the payment from chain and checks both hashes, so a dishonest
  index can waste a sweep but never change a verdict.

## Sponsors

Each holds up a different third of the system.

**Hedera** — the escrow and the payment rail. Live x402 payments settled through
Blocky402 into a contract, with real paid requests and real refunds.

**Chainlink** — the confidential adjudicator. A registered TEE handler processing
sensitive payloads inside AWS Nitro, plus CCIP carrying the verdict cross-chain.

**Bazantic** — the whole thing republished as an agent-callable gateway, so any
agent can ask "did this response honour its SLA?" without deploying anything.
See [`bazantic/RECIPE.md`](bazantic/RECIPE.md).

## Repository

| Path | What |
| --- | --- |
| `contracts/` | `RecourseEscrow` (Hedera), `VerdictRelay` (Sepolia), 40 Foundry tests |
| `sla/` | SLA schema, deterministic operators, canonical hashing, the adjudicator |
| `cre/adjudicate/` | The confidential workflow that runs inside the enclave |
| `services/` | x402 seller, buyer agent, dispute index, agent gateway |
| `bazantic/` | Gateway notes and the Recipe |

## Running it

```bash
# contracts
cd contracts && forge test

# the SLA judge
cd sla && bun install && bun test

# services (three terminals)
cd services && bun install
bun run index                                    # dispute queue  :8403
SELLER_PRIVATE_KEY=0x… bun run seller            # x402 seller    :8402
bun run gateway                                  # agent gateway  :8404

# a purchase that gets refunded
BUYER_PRIVATE_KEY=0x… BUYER_ACCOUNT_ID=0.0.… bun run src/buyer.ts negative

# an honest one, released to the seller
BUYER_PRIVATE_KEY=0x… BUYER_ACCOUNT_ID=0.0.… WINDOW_SECONDS=60 bun run src/buyer.ts
BUYER_PRIVATE_KEY=0x… bun run src/release.ts <paymentId>

# the adjudicator
cd cre && cre workflow simulate adjudicate --target staging-settings --broadcast
```

The seller's `?misbehave=` switch forces one specific clause violation each —
`stale`, `spread`, `negative`, `malformed`, `missing`, `wrong-type` — so a demo
can name the promise that broke.

**78 tests**: 40 Foundry, 22 SLA, 10 CRE, 6 receipt.

## What is not done

Stated plainly, because a demo that hides its edges is worth less than one that
does not.

- **A seller could misstate its own `servedAt`.** Freshness is checked from two
  timestamps inside the signed body, which needs no clock and cannot be skewed by
  dispute timing — but nothing on-chain attests that a seller's clock is honest.
  The buyer compares it against local time on receipt; that is the whole defence.
- **The CRE handler has no unit tests.** It needs a `TeeRuntime`, and the SDK
  exports `TestTeeRuntime` without a constructor for it. `simulate` is its only
  exercise. The cross-language seams around it *are* tested.
- **Payout to an address with no Hedera account is untested.** The seller in every
  run so far already had one.
- **`disputeTimeout` is 6 hours.** Measured verdict-to-refund latency was ~18
  minutes, nearly all Sepolia finality, so this is deliberately generous.
- **The dispute index is in-memory.** Losing it costs a re-submission, not money:
  the escrow holds the funds and the deadlines.

## One bug worth reading about

The first live verdict reached Hedera and did nothing. CCIP reported the message
delivered, the OffRamp transaction succeeded, and the escrow never moved.

`CCIPReceiverBase` did not implement `supportsInterface`. Before delivering, the
CCIP router staticcalls it; an address that reverts is treated as an ordinary
account, so **the router skips the receiver and still records the message as
executed**. Nothing anywhere reports a failure. The verdict is simply gone.

It came from trimming Chainlink's `CCIPReceiver` down to "the parts we use."
`supportsInterface` looks like ceremony and is load-bearing. Two tests now pin it,
including the literal `0x85572ffb` the router uses.
