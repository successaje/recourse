# The payment that arrives without knocking

**Track:** AI & Agentic Payments on Hedera
**What we built:** an escrow that lets an agent get its money back when a paid API lies to it

---

## Two live x402 services, and one that holds the money

| Service | Endpoint | Price | `payTo` |
| --- | --- | --- | --- |
| Quote seller | `POST /quote` | 0.1 ℏ | `0.0.10380390` — **the escrow contract** |
| Adjudication gateway | `POST /v1/adjudicate` | 0.01 ℏ | `0.0.4426240` |

Both are gated with x402 v2 and settled through **Blocky402** on Hedera testnet
(`api.testnet.blocky402.com`, fee payer `0.0.7162784`). Both have taken real
paid requests. The interesting one is the first, because its `payTo` is not an
account — it is a contract that will not let the seller have the money yet.

That single change is the whole product. Under plain x402, settlement is final
before the response exists, so a seller that returns an empty object or a
negative price keeps the money. A human notices and stops buying. An agent making
a thousand calls an hour does not notice and has no refund path.

## What Hedera taught us

We expected the escrow to learn about its own funding the way an EVM contract
always does — the facilitator transfers to the contract, `receive()` fires, the
deposit is recorded. On Hedera that silently does nothing.

> A native `TransferTransaction` credits a contract's balance **without invoking
> `receive()` or `fallback()`**. Only a `ContractExecuteTransaction` runs code.

The x402 facilitator settles with a native transfer. So the money lands, the
balance goes up, and the contract has no idea it happened. There is no event to
hook, no callback to implement, and nothing in the transaction that a contract
can react to. **The payment arrives without knocking.**

This is the kind of thing you either know about Hedera or lose a day to. We lost
the day. It is also, we think, the most useful thing in this submission for
anyone else building custody on Hedera, so it is stated plainly rather than
buried in a commit.

### The fix: prove the money is there, do not wait to be told

Funding and terms became two steps. The facilitator settles into the escrow, then
anyone calls `bind()` to attach terms to that deposit — and the contract only
commits funds it can prove it already holds:

```solidity
uint256 available = unboundBalance();          // balance − totalCommitted
if (available < amount) revert InsufficientUnbound(available, amount);
totalCommitted += amount;
```

`unboundBalance()` is the money the contract is sitting on that nobody has a
claim to yet. A deposit can be bound once and only once, so one settlement can
never back two payments. The contract never trusts a caller's claim to have paid
— it checks its own balance.

The invariant this buys is worth stating on its own: **committed funds are always
backed by real balance.** Verified live on the deployment right now:

```
escrow balance   11,000,000 tinybar
totalCommitted   11,000,000
unboundBalance            0
```

Exact, not approximate. There is a Foundry fuzz test asserting it cannot be
violated from any binding sequence, alongside 39 others.

## Real paid requests

**A response that broke its promise, refunded:**

| Step | On Hedera |
| --- | --- |
| x402 settlement into the escrow | `0.0.7162784@1788624601.728920938` |
| Deposit bound to the agreed terms | `bind` on `0.0.10380390` |
| Dispute opened with a 0.01 ℏ bond | payment `0xc79c411d…0991` |
| Verdict returned over CCIP | `REJECT` · clause 2 · `numeric.gt` at `$.bid` |
| **Buyer refunded** | **+0.11 ℏ** — the payment *and* the bond |

**A response that honoured it, released:**

| Step | On Hedera |
| --- | --- |
| x402 settlement | `0.0.7162784@1788626670.841803967` |
| Release after the window lapsed | `0x7fbd0eb1…316a` |
| **Seller paid** | **+0.1 ℏ**, one call, no oracle |

**A paid call to the gateway**, which is the same rail used for a different
product — buying a verdict rather than data:

```
settled  0.0.7162784@1788927344.981253996
verdict  REJECT — clause 2 failed: numeric.gt at $.bid
```

The uncontested path is deliberately the cheapest: the seller withdraws with one
contract call and no adjudication happens at all. Disputes are the exception, and
only the exception pays for the machinery.

## The payment flow

```
agent ──GET /quote──────────────────────> seller
      <──402 · 0.1 ℏ · payTo 0.0.10380390 · slaHash──

      the agent fetches the SLA and checks it hashes to what was quoted;
      it refuses to pay for terms that do not match their own advertised hash

      ──signed payload──> Blocky402 /verify → /settle
                          native transfer ──> escrow contract (no code runs)

      ──bind(paymentId, seller, amount, slaHash, window)──> escrow
                          commits the deposit against the terms

      ──GET /quote + X-PAYMENT──> seller
      <──200 · body + sellerSig(paymentId ‖ keccak(body))──

      the agent checks the response against the SLA before using it
```

From there, either the window lapses and the seller calls `release()`, or the
agent disputes with a bond and a Chainlink CRE enclave rules on it. Every clause
is a pure function of the response body, so the verdict names a specific broken
promise — `reason 102` is clause 2 — rather than an opinion.

## A bug worth sharing

Paying for a real adjudication is how we found this, and any x402 seller on
Hedera can have it right now:

**Blocky402 reports a refused payment as HTTP 200.** `/verify` answers `200` with
`isValid: false`; `/settle` answers `200` with `success: false` when the transfer
failed on chain. Our gateway gated on `response.ok`, so a payment that failed
precheck still bought the answer. We caught it by reading the settlement block in
our own response:

```json
"x402Settlement": { "success": false, "errorReason": "transaction_failed" }
```

Verdict served anyway. Fixed by gating on the facilitator's own verdict rather
than the status code, with an unrecognised body counting as failure — rejecting a
good payment is recoverable, accepting a bad one is not. Proven closed by
replaying a settled payment:

```
first  (valid payment) : HTTP 200  verdict=APPROVE
replay (same payment)  : HTTP 402  error=settlement failed
```

If you are building an x402 seller, check the body, not the status.

## Two more practical notes

**The JSON-RPC relay lags consensus.** The facilitator returns once consensus is
reached, but reading the escrow through HashIO immediately after still shows the
old balance, so `bind()` reverts with `InsufficientUnbound` against money that is
demonstrably there. Both the agent and the seller poll for the state they expect
rather than assuming a settled payment is instantly visible.

**An address is not an account.** The deployer's EVM address
`0xC282…A88e` resolves to Hedera account `0.0.10378045`; the escrow contract
`0x7E7A…00bB` is `0.0.10380390`. x402 requirements name the account id, the
contract calls name the EVM address, and the two have to be kept straight in the
same code path.

## Deployment

| | |
| --- | --- |
| `RecourseEscrow` | `0x7E7A73e5bE1F45D9B3033C2a96087B62855e00bB` (`0.0.10380390`) |
| Network | Hedera testnet, chain id **296** |
| Facilitator | Blocky402 `api.testnet.blocky402.com`, fee payer `0.0.7162784` |
| Tests | 40 Foundry, including a solvency fuzz test |

Full record with every transaction hash: [`contracts/DEPLOYMENTS.md`](../contracts/DEPLOYMENTS.md).

## Requirements

| Asked for | Where |
| --- | --- |
| Live x402-gated service on Hedera settled through Blocky402 | Two — the quote seller and the adjudication gateway |
| A platform or agent consuming it | `services/src/buyer.ts` — fetches terms, verifies the SLA hash, settles, binds, validates, disputes |
| ≥1 real paid request | Three cited above, refund and release paths both settled on-chain |
| Public repo with setup, architecture, payment flow | [`README.md`](../README.md); flow above |
| Demo video ≤5 minutes | [`DEMO.md`](../DEMO.md) — segments 3 and 6 are the Hedera path |

## What we have not done

- **Mainnet.** Everything is testnet.
- **HTS tokens.** Settlement is native HBAR (`asset: 0.0.0`). The SLA already
  carries an asset field, so a token id is a configuration change rather than a
  redesign, but it is untested.
- **Payout to an address with no Hedera account.** Every seller in our runs
  already had one. A contract paying a brand-new EVM address is the case we
  cannot claim works.
- **A seller could misstate its own `servedAt`.** Freshness is checked from two
  timestamps inside the signed body, which needs no clock and cannot be skewed by
  when a dispute is filed — but nothing on-chain attests that a seller's clock is
  honest. The buyer comparing it against local time on receipt is the whole
  defence.
