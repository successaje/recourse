# The oracle that must not publish

**Track:** Best Confidential Workflow
**Workflow:** `cre/adjudicate` — a TEE handler that settles payment disputes between AI agents
**Live:** [recourse-nine.vercel.app](https://recourse-nine.vercel.app) — see [a real adjudicated dispute](https://recourse-nine.vercel.app/payment/0xc79c411d326b9088fa8e0279fbd06ad604d4b04afb85fa595d194c0b96790991),
where the sealed payloads are shown as withheld and the verdict reads `reason 102`

---

## The inversion

Every oracle ever written exists to make a private fact public. A price is known
to an exchange; the oracle's job is to carry it on-chain so a contract can act on
it. Publication *is* the product.

Recourse needs the exact opposite, and that is why it is here.

When an AI agent pays for an API call and the response is garbage, someone has to
look at the response to rule on it. But the response is the thing the buyer paid
to keep private — a trading signal, a credit decision, a medical summary. It is
worth money precisely because nobody else has it.

So the adjudicator faces a demand no ordinary oracle can meet:

> **Read the payload. Decide who gets the money. Never reveal what you read.**

A Data Feed cannot do this. Neither can a normal Functions call: the payload
would pass through node operators in the clear, and a service whose entire value
is confidentiality would be disclosing its output to claw back ten cents. That is
worse than eating the loss, which is why nobody builds this and why the dispute
layer for agentic payments does not exist yet.

Confidential Workflows are not a nice-to-have here. They are the only reason the
product is possible.

## What runs inside the enclave

The handler is registered with `cre.handlerInTee` and pinned to AWS Nitro:

```ts
cre.handlerInTee(cronTrigger.trigger({ schedule: config.schedule }), onSweep, [
  { tee: 'nitro', regions: ['us-west-2'] },
])
```

Everything that matters happens before the boundary is crossed. Inside the
enclave, over confidential HTTP, it pulls:

- the **disputed response body** — the sensitive payload itself
- the **SLA document** — the machine-checkable promises the seller published
- the **payment record**, read from the Hedera escrow by `eth_call`, pinned to
  the block the dispute landed in

It then verifies, judges, and crosses back out with almost nothing.

## Three ideas we think are worth your attention

### 1. The judge cannot be a language model, and that is the good news

The obvious build is to drop an LLM in the enclave and ask it whether the
response looked right. We started there. It does not work, and the reason is
structural rather than a limitation of models:

> *Keep it deterministic for a given input — the enclave result is attested and
> verified by DON consensus before the workflow completes.*
> — the CRE SDK's own confidential template

A model returns different text on identical input. Attestation over a
non-deterministic result is meaningless, and consensus over it is impossible. Any
team that ships an LLM judge inside a TEE has built something that cannot be
verified.

So the model moved upstream, where non-determinism is free. An LLM helps a seller
**author** a machine-checkable SLA when they list a service — a schema plus a
list of pure predicates, content-addressed and agreed by both parties before a
single tinybar moves. The enclave then does something far more defensible than
judging:

**It enforces a contract both sides already signed.**

"Trust our model" invites the obvious question. "Deterministic, attested, and
reproducible by anyone" does not. The constraint made the product better, not
smaller.

That commitment runs down to the smallest detail. There is no clock read in the
handler:

```ts
// The dispute's own deadline, not a clock read. `Date.now()` here would make
// the verdict non-deterministic and break consensus on the attestation.
evaluatedAt: Number(payment.deadline),
```

Freshness is judged against a timestamp that is already on-chain. Two nodes
adjudicating the same dispute a minute apart reach the identical verdict.

### 2. The enclave protects the data, not the code — and that is the right way round

Most confidential-compute pitches imply the secret is the logic. Ours says the
opposite, out loud, because it is what is actually true:

> *A confidential workflow, despite running inside the enclave, is part of the
> binary the Workflow DON provides to the enclave — so the binary, including this
> logic, is revealed.*

The workflow binary is **public**. The adjudication rules are **auditable**. Only
the payloads are sealed.

We think that is not a caveat but the entire point. A dispute layer that judged
by secret rules would be a worse product than the problem it solves — you would
be swapping a seller you cannot hold to account for an arbitrator you cannot
inspect. Recourse is the reverse: anyone can read exactly how a verdict is
reached, and nobody can read the evidence it was reached from.

Public rules, private facts. That is what a court is.

### 3. It checks that the evidence is real before it judges whether it is good

The question a judge asks first: if the buyer supplies the disputed response,
what stops them pasting in garbage? If the seller supplies it, what stops them
producing an answer they never sent?

The enclave never takes either party's word. Before any clause is evaluated it
verifies two hashes:

| Check | Against | Stops |
| --- | --- | --- |
| `keccak(body)` | the receipt the **seller signed** | a buyer fabricating a bad response |
| `canonicalHash(sla)` | the commitment **bound on-chain** at payment | either side swapping the terms afterwards |

The seller fixes the hash by signing it; the buyer supplies the bytes. Neither
can move without the other, so neither can forge the case. Fail either check and
the dispute is thrown out on evidence — reason codes `1` and `7` — without the
response ever being judged on merit.

## What crosses the boundary

Exactly three values, plus the enclave's attestation:

```ts
const donRuntime = runtime.usingTheDons()

encodeAbiParameters(
  parseAbiParameters('bytes32 paymentId, uint8 outcome, uint16 reasonCode'),
  [paymentId, verdict.outcome, verdict.reasonCode],
)
```

| Leaves the enclave | Stays sealed |
| --- | --- |
| `paymentId` | the response body |
| `outcome` — approve or reject | the SLA document |
| `reasonCode` — *which clause broke* | the request payload |
| attestation | the failure detail |

`reasonCode` is the part we are proudest of. It is `100 + N`, where `N` is the
index of the first clause that failed. A refund therefore arrives on-chain
carrying **a specific broken promise** rather than a shrug:

```
REJECT reason=102   →   clause 2 · numeric.gt at $.bid   →   "bid is positive"
```

The buyer learns which term was violated. The public learns only that term's
number. The response itself is never disclosed to anyone.

## Two Chainlink products, each doing the job it exists for

Adjudication produces a verdict on Ethereum Sepolia. The money is on Hedera. That
gap is not a design preference — we measured it:

```
$ cre workflow supported-chains 2>&1 | grep -cE '[0-9]{15,}'
57
$ cre workflow supported-chains 2>&1 | grep -ci hedera
0
```

**CRE cannot write to Hedera.** No forwarder exists there for `writeReport` to
reach. So the enclave writes its report to a relay on Sepolia, where the
KeystoneForwarder verifies the DON signatures, and **CCIP** carries the verdict
the rest of the way to the escrow. The escrow accepts it only from the CCIP
router with that relay as the authenticated sender.

Every hop is authenticated and no privileged operator sits anywhere in the path.
The lane was confirmed on-chain rather than from documentation, which was
necessary because the docs are wrong — Sepolia's own CCIP page omits Hedera from
its destination list:

```
$ cast call 0x0BF3…3A59 "isChainSupported(uint64)(bool)" 222782988166878823
true
```

### A bug we found doing it, worth knowing about

Our first live verdict reached Hedera and did nothing. CCIP reported the message
delivered. The OffRamp transaction succeeded. The escrow never moved.

`CCIPReceiverBase` did not implement `supportsInterface`. The router staticcalls
it before delivering; an address that reverts is treated as an ordinary account,
so **the router skips the receiver and still records the message as executed**.
Nothing anywhere reports a failure. The verdict is simply gone.

It came from trimming Chainlink's `CCIPReceiver` down to "the parts we use."
`supportsInterface` looks like ceremony and is load-bearing. Two tests now pin
it, including the literal `0x85572ffb` the router checks for. We mention it
because any team vendoring that base contract can lose funds the same way, in
silence.

## Running it

```bash
cd cre
cre workflow simulate adjudicate --target staging-settings --broadcast
```

Worth flagging for other entrants: **`--broadcast` submits genuine transactions**
and does not require deployment access. We proved it against the pre-deployed
Sepolia `KeeperConsumer` — without the flag the returned tx hash is all zeros and
on-chain state is untouched; with it, an unfunded key fails at
`gas required exceeds allowance (0)`, which is a real transaction rejected only
for gas. Our org is `GATED` and we never needed to leave simulation to produce
real on-chain state.

### A verdict, end to end

| Stage | Evidence |
| --- | --- |
| Payment settled on Hedera via x402 | `0.0.7162784@1788624601.728920938` |
| Dispute opened | payment `0xc79c411d…0991` |
| Enclave verdict | `REJECT reason=102` — clause 2, `numeric.gt` at `$.bid` |
| Report written to Sepolia | [`0x98d8c558…2ec7`](https://sepolia.etherscan.io/tx/0x98d8c5584c793b0b76643c5233995b2e09fc04def6cda68b6a7b31440af72ec7) |
| CCIP message | `0xa4fb4823…db84` |
| **Buyer refunded** | **+0.11 HBAR** — the payment and the bond |

## Requirements

| Asked for | Where |
| --- | --- |
| CRE Workflow using Confidential Workflows | `cre/adjudicate/workflow.ts` |
| A meaningful portion executed inside the TEE | The entire adjudication: evidence integrity, SLA enforcement, verdict |
| A registered confidential TEE handler | `cre.handlerInTee(…, [{ tee: 'nitro', regions: ['us-west-2'] }])` |
| ≥1 sensitive input processed inside the enclave | Three — disputed response body, SLA document, and the on-chain payment record |
| Successful execution demonstrated | `cre workflow simulate adjudicate --broadcast`, writing a real Sepolia transaction |
| Demo video, logs, or deployment details | [`DEMO.md`](../DEMO.md) segment 4; deployments in [`contracts/DEPLOYMENTS.md`](../contracts/DEPLOYMENTS.md) |

## What we have not done

Stated plainly, because a submission that hides its edges is worth less than one
that does not.

- **The handler has no unit tests.** It needs a `TeeRuntime`, and the SDK exports
  `TestTeeRuntime` without a constructor for it — `newTestTEERuntime` appears
  only in a comment. `simulate` is its only exercise. The cross-language seams
  around it *are* tested, including a check that parses `Verdict.sol` directly so
  the TypeScript and Solidity reason codes cannot drift apart.
- **`runtime.log` in the handler names the failing clause.** Logs do not leave a
  real enclave, and the line is marked for removal before anyone relies on
  confidentiality in production. It is there because a simulation you cannot read
  teaches you nothing.
- **The dispute queue is untrusted, and that is deliberate** — but it is also
  in-memory. The enclave re-reads the payment from chain and verifies both
  hashes, so a dishonest queue can waste a sweep and never change a verdict.
