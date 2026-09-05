# Demo script

One recording, roughly **4 minutes**, serving all three submissions. Hedera caps
at 5 minutes, so there is headroom but not much — the timings below are tight on
purpose.

Two things in this system cannot be filmed live:

- **CCIP delivery takes ~18 minutes**, nearly all Sepolia finality. Segment 5
  cuts to a payment that settled earlier. Say so out loud. A cut you narrate
  reads as competence; a cut you hide reads as a fake demo if anyone checks the
  timestamps, and the transaction hashes are public.
- **`cre workflow simulate` must run from the `/tmp` copy** on this machine (a
  stray `~/package.json` carrying viem 1.18.2 gets bundled and traps the WASM).
  Set that terminal up before recording so it never appears on camera.

---

## Pre-flight

Do all of this **before** hitting record.

```bash
# 1. Three service terminals, left running
cd ~/Documents/github/recourse/services
bun run index                                          # :8403
SELLER_PRIVATE_KEY=0x59c6…690d bun run seller          # :8402
bun run gateway                                        # :8404

# 2. Sync the workflow to the runnable copy
SP=/private/tmp/claude-501/.../scratchpad/recourse_run
rsync -a --exclude node_modules --exclude bun.lock ~/Documents/github/recourse/cre/ "$SP/cre/"
rsync -a --exclude node_modules --exclude bun.lock ~/Documents/github/recourse/sla/ "$SP/sla/"
```

Check before recording:

- Buyer account has **> 1 HBAR** (each run costs 0.11)
- Relay has Sepolia ETH for CCIP fees (~0.000224 per verdict)
- **Pre-staged settled payment** from an earlier run, for segment 5 — have its
  id and the explorer tab already open
- `cre workflow simulate` succeeds once in rehearsal; the CRE auth token expires
  and its refresh occasionally fails on TLS. Retrying fixes it, but not on camera

Terminal at ~16pt. Font small enough to fit a full command, large enough to read
compressed.

---

## Segment 1 — the problem (0:00–0:30)

**On screen:** the seller's `402`, then a paid response with a negative bid.

**Say:**

> x402 lets an agent pay for an API call. It works, and it has one hole:
> settlement happens *before* the response is generated.
>
> Here is a quote service. The agent pays, and gets this back.

Highlight `"bid": -1`.

> A negative bid. Well-formed JSON, completely unusable, and the money is already
> gone. A human notices and stops buying. An agent making a thousand calls an
> hour does not notice, and has no refund path.

**Do not rush this.** The whole project only matters if the problem lands.

---

## Segment 2 — what changes (0:30–0:55)

**On screen:** the `402` body, cursor on `payTo`.

**Say:**

> Recourse changes one thing. `payTo` is not the seller — it is an escrow
> contract on Hedera. The money settles somewhere neither party can take it from
> unilaterally.
>
> The `402` also carries a hash of the SLA: a machine-checkable list of promises
> the seller is making about the response. Both sides agree to it before any
> money moves.

Show `bazantic/RECIPE.md` or the SLA briefly — five clauses, one of which is
"spread within 50bps".

---

## Segment 3 — buy, catch, dispute (0:55–1:50)

**Run live:**

```bash
BUYER_PRIVATE_KEY=0x… BUYER_ACCOUNT_ID=0.0.10378045 bun run src/buyer.ts negative
```

Narrate as lines appear — the output is already paced well:

> It fetches the terms and checks the SLA hashes to what was quoted. Refuses to
> pay for terms that do not match their own advertised hash.
>
> Settles on Hedera through Blocky402 — into the escrow.
>
> Binds the deposit to those exact terms on-chain. That is a separate
> transaction because on Hedera a native transfer credits a contract's balance
> without running any of its code, so the escrow cannot be notified by the
> payment itself.
>
> Response comes back, and the agent checks it against the SLA before using it —
> `clause 2 failed: numeric.gt at $.bid`.
>
> It disputes. Ten percent bond, so this costs something if the agent is wrong.

**Key line to land:**

> Notice what it did *not* do: ask a language model whether the data looked
> right. It checked a promise the seller published, and it can name which one
> broke.

---

## Segment 4 — the enclave (1:50–2:45)

**Switch to the CRE terminal. Run live:**

```bash
cre workflow simulate adjudicate --target staging-settings --broadcast
```

**Say while it compiles:**

> The adjudicator runs inside an AWS Nitro enclave through Chainlink CRE. It
> does not trust the buyer's dispute. It re-reads the payment from the Hedera
> escrow, pinned to the block the dispute landed in, and pulls the evidence over
> confidential HTTP.
>
> Then it checks two hashes. The SLA has to match what was committed on-chain,
> and the response body has to hash to what the seller *signed*. The seller
> fixed the hash; the buyer supplies the bytes. Neither can move without the
> other, so neither can fabricate the evidence.

When `REJECT reason=102` appears:

> `102` is offset 100 plus clause 2 — `numeric.gt` on `$.bid`. The refund points
> at a specific published promise, not a judgement call.

> One thing worth being precise about: the enclave keeps the *data* private, not
> the code. The workflow binary is public. The rules being auditable is the
> point — only the payload is sealed.

**Show the Sepolia transaction** in a browser tab. Point at `VerdictForwarded`
and the decoded `outcome=2, reason=102`.

> CRE cannot write to Hedera — it is absent from all 57 chains a tenant can
> target. So the verdict lands on Sepolia, where a forwarder verifies the DON
> signatures, and CCIP carries it the rest of the way.

---

## Segment 5 — settlement (2:45–3:10)

**Say the cut out loud:**

> CCIP waits for Sepolia finality, so delivery takes about eighteen minutes.
> This is one I ran earlier.

**On screen:** the gateway's payment lookup, which is the cleanest single shot.

```bash
curl -s localhost:8404/v1/payments/0xc79c411d…0991 | jq
```

> State `Settled`. And on-chain the buyer is up **0.11 HBAR** — the payment plus
> the bond back. The bond returns because the buyer was right; if the verdict
> had gone the other way the seller would have taken both, which is what makes
> frivolous disputes cost something.

---

## Segment 6 — the honest path (3:10–3:35)

> The refund path is the interesting one, but it is not the common one. Here is
> a purchase where the seller behaves.

```bash
WINDOW_SECONDS=60 bun run src/buyer.ts        # → APPROVE, all 5 clauses held
bun run src/release.ts <paymentId>            # → seller paid 0.1 HBAR
```

> All five clauses held, so there is nothing to dispute. The window lapses and
> the seller withdraws. **One contract call, no oracle, no adjudication.**
>
> That is the economic claim: disputes are the exception, and only the exception
> pays for the machinery.

---

## Segment 7 — the gateway, and the close (3:35–4:00)

**For Bazantic**, show the A/B contrast. Use `?misbehave=spread` — it is the best
one on camera because the bad response looks *completely normal*:

> Same question asked twice. Without the Recipe, the agent has the raw API, pays,
> gets well-formed JSON, and uses it — a quote whose spread quietly breaks the
> published fifty-basis-point ceiling. Nothing looks wrong.
>
> With the Recipe, it calls `/v1/adjudicate` and gets `REJECT`, clause 4,
> `numeric.lte` on `$.spreadBps` — and refuses the data.

**Close:**

> Every x402 service built at this hackathon has the same hole. Recourse is the
> layer that closes it, and it works end to end today: real payments, a real
> enclave verdict, a real refund.

---

## If something breaks on camera

- **`cre` auth error** — transient TLS on token refresh. Re-run. Rehearse first
  so the token is fresh.
- **`InsufficientUnbound` on bind** — Hedera's RPC relay is behind consensus. The
  buyer already retries; if it times out, just re-run the purchase.
- **Seller returns 402 "not bound in escrow"** — same lag, on the read side.
  Re-run.
- **Out of HBAR** — each full run costs 0.11. Top up at the Hedera portal faucet.

Record segments separately if a single clean take proves elusive. Nothing here
depends on being one continuous shot, and the sponsors ask for a demo, not a
performance.

## What not to claim

Worth writing down, because it is easy to oversell under time pressure:

- Do not say the workflow is *deployed*. It runs through `simulate --broadcast`,
  which writes real transactions but is not a deployed CRE workflow. Deployment
  access is gated; we did not need it.
- Do not say freshness is *proven*. A seller could misstate its own `servedAt`;
  the buyer checking it against local time is the defence, and it is a real
  limitation.
- Do not imply the verdict is a general judgement about data quality. It is
  enforcement of a published SLA and nothing more — which is precisely why it
  can be trusted.
