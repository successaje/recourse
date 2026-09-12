# Voiceover

Two versions of the same script. The first is just the words, for reading
straight through. The second is the same words with what to do on screen.

Target is about four minutes. Hedera caps at five. Roughly 600 words of speech,
which at a normal pace lands around 4:00 with pauses.

Read it a little slower than feels natural. Everything here is a real number, so
give the numbers room.

---

## 1. Voiceover only

> x402 lets an AI agent pay for an API call. It works, and it has one hole.
>
> The money moves before the response exists.
>
> Here's a quote service. The agent pays, and gets this back.
>
> A negative bid. It's well-formed JSON, it's completely unusable, and the money
> is already gone. A person would notice and stop buying. An agent making a
> thousand calls an hour doesn't notice, and has no way to ask for a refund.
>
> Recourse changes one thing. The payment goes to an escrow contract on Hedera
> instead of to the seller.
>
> And before any money moves, the seller publishes an SLA. It's a short list of
> promises a machine can check. Bid has to be positive. Spread within fifty basis
> points. The four-oh-two carries the hash of that document, and the buyer
> refuses to pay if the terms don't match what was advertised.
>
> So let's buy something.
>
> It fetches the terms and checks the hash. Settles on Hedera through Blocky402,
> into the escrow. Then it binds the deposit to those exact terms on chain.
>
> That's a separate transaction, and there's a good reason for it. On Hedera a
> native transfer credits a contract's balance without running any of its code.
> So the escrow can't be told about its own funding. It has to prove it.
>
> Response comes back. The agent checks it before using it. Clause two failed.
>
> So it disputes, and posts a bond worth ten percent.
>
> Notice what it didn't do. It didn't ask a language model whether the data
> looked right. It checked a promise the seller published, and it can name which
> one broke.
>
> Now the adjudicator. This runs inside an AWS Nitro enclave, through Chainlink
> CRE.
>
> It doesn't trust the dispute. It re-reads the payment from the escrow, pinned to
> the block the dispute landed in, and pulls the evidence over confidential HTTP.
>
> Then it checks two hashes. The SLA has to match what's committed on chain. And
> the response has to hash to what the seller signed. The seller fixed the hash,
> the buyer supplies the bytes. Neither can move without the other, so neither can
> fake the evidence.
>
> Reject. Reason one-oh-two.
>
> That's offset a hundred, plus clause two. The refund points at a specific
> broken promise, not an opinion.
>
> One thing worth being precise about. The enclave keeps the data private, not
> the code. The workflow binary is public. The rules being auditable is the
> point. Only the payload is sealed.
>
> CRE can't write to Hedera. It isn't one of the fifty-seven chains it can reach.
> So the verdict lands on Sepolia, where a forwarder checks the signatures, and
> CCIP carries it the rest of the way.
>
> That takes about eighteen minutes, almost all of it Sepolia finality. So this
> one I ran earlier.
>
> Settled. The buyer is up eleven hundredths of an HBAR. That's the payment, plus
> the bond back, because the buyer was right. If the verdict had gone the other
> way, the seller would have taken both. That's what stops people disputing
> everything.
>
> Here's the same thing when the seller behaves.
>
> All five clauses held. Nothing to dispute. The window closes, the seller
> withdraws. One contract call, no enclave, no cross-chain hop.
>
> That's the economic claim. Disputes are the exception, and only the exception
> pays for the machinery.
>
> And this is all callable. The adjudicator is deployed on Bazantic as a gateway
> with an MCP server, so any agent can ask the question directly.
>
> Same question, twice. Without it, the agent pays, gets clean-looking JSON, and
> uses a quote whose spread quietly breaks the published limit. Nothing looks
> wrong.
>
> With it, clause four, reject. And it refuses the data.
>
> Every x402 service built at this hackathon has the same hole. Recourse is the
> layer that closes it, and it works end to end today. Real payments, a real
> enclave verdict, a real refund.

---

## 2. Voiceover with actions

Pre-flight is in [`DEMO.md`](DEMO.md). Do all of it before recording, especially
installing dependencies in **both** synced copies, or the adjudicator dies at
typecheck on camera.

### Segment 1 — the problem (0:00–0:35)

**Screen:** terminal, the seller's `402` response, then a paid response with
`"bid": -1`. Have both already printed so you're not waiting on a request.

> x402 lets an AI agent pay for an API call. It works, and it has one hole.
>
> The money moves before the response exists.
>
> Here's a quote service. The agent pays, and gets this back.

**Do:** highlight or cursor over `"bid": -1`. Pause for a beat.

> A negative bid. It's well-formed JSON, it's completely unusable, and the money
> is already gone. A person would notice and stop buying. An agent making a
> thousand calls an hour doesn't notice, and has no way to ask for a refund.

Don't rush this. The whole project only matters if the problem lands.

### Segment 2 — what changes (0:35–0:55)

**Screen:** the `402` body, cursor resting on `payTo`.

> Recourse changes one thing. The payment goes to an escrow contract on Hedera
> instead of to the seller.

**Do:** scroll to the SLA document, five clauses visible.

> And before any money moves, the seller publishes an SLA. It's a short list of
> promises a machine can check. Bid has to be positive. Spread within fifty basis
> points. The four-oh-two carries the hash of that document, and the buyer
> refuses to pay if the terms don't match what was advertised.

### Segment 3 — buy, catch, dispute (0:55–1:50)

**Run live:**

```bash
BUYER_PRIVATE_KEY=0x… BUYER_ACCOUNT_ID=0.0.10378045 bun run src/buyer.ts negative
```

> So let's buy something.

Narrate as the lines appear. The output paces itself well.

> It fetches the terms and checks the hash. Settles on Hedera through Blocky402,
> into the escrow. Then it binds the deposit to those exact terms on chain.
>
> That's a separate transaction, and there's a good reason for it. On Hedera a
> native transfer credits a contract's balance without running any of its code.
> So the escrow can't be told about its own funding. It has to prove it.

**Wait for:** `violation  clause 2 failed: numeric.gt at $.bid`

> Response comes back. The agent checks it before using it. Clause two failed.
>
> So it disputes, and posts a bond worth ten percent.

**Do:** pause here. This is the line that separates you from every other entry.

> Notice what it didn't do. It didn't ask a language model whether the data
> looked right. It checked a promise the seller published, and it can name which
> one broke.

### Segment 4 — the enclave (1:50–2:45)

**Switch to the CRE terminal. Run live:**

```bash
cre workflow simulate adjudicate --target staging-settings --broadcast
```

Talk over the compile.

> Now the adjudicator. This runs inside an AWS Nitro enclave, through Chainlink
> CRE.
>
> It doesn't trust the dispute. It re-reads the payment from the escrow, pinned to
> the block the dispute landed in, and pulls the evidence over confidential HTTP.
>
> Then it checks two hashes. The SLA has to match what's committed on chain. And
> the response has to hash to what the seller signed. The seller fixed the hash,
> the buyer supplies the bytes. Neither can move without the other, so neither can
> fake the evidence.

**Wait for:** `REJECT reason=102 tx=0x…`

> Reject. Reason one-oh-two.
>
> That's offset a hundred, plus clause two. The refund points at a specific
> broken promise, not an opinion.
>
> One thing worth being precise about. The enclave keeps the data private, not
> the code. The workflow binary is public. The rules being auditable is the
> point. Only the payload is sealed.

**Do:** switch to the Sepolia transaction in a browser tab, already open.

> CRE can't write to Hedera. It isn't one of the fifty-seven chains it can reach.
> So the verdict lands on Sepolia, where a forwarder checks the signatures, and
> CCIP carries it the rest of the way.

### Segment 5 — settlement (2:45–3:15)

**Say the cut out loud.** A cut you narrate reads as competence. A cut you hide
reads as a fake demo if anyone checks the timestamps, and the hashes are public.

> That takes about eighteen minutes, almost all of it Sepolia finality. So this
> one I ran earlier.

**Screen:** the payment page on the live site, scrolled to the adjudication panel
and the SLA clauses.

```
https://recourse-nine.vercel.app/payment/0xc79c411d326b9088fa8e0279fbd06ad604d4b04afb85fa595d194c0b96790991
```

> Settled. The buyer is up eleven hundredths of an HBAR. That's the payment, plus
> the bond back, because the buyer was right. If the verdict had gone the other
> way, the seller would have taken both. That's what stops people disputing
> everything.

**Do:** let the clause list sit on screen for two or three seconds. Clause two
red, clauses three to five "not evaluated". It reads on its own.

### Segment 6 — the honest path (3:15–3:35)

> Here's the same thing when the seller behaves.

```bash
WINDOW_SECONDS=60 bun run src/buyer.ts
bun run src/release.ts <paymentId>
```

> All five clauses held. Nothing to dispute. The window closes, the seller
> withdraws. One contract call, no enclave, no cross-chain hop.
>
> That's the economic claim. Disputes are the exception, and only the exception
> pays for the machinery.

### Segment 7 — the gateway (3:35–4:00)

**Screen:** the Bazantic gateway page, then a terminal.

> And this is all callable. The adjudicator is deployed on Bazantic as a gateway
> with an MCP server, so any agent can ask the question directly.

**Do:** the A/B. Use `?misbehave=spread`, because the bad response looks
completely normal, which is the point.

> Same question, twice. Without it, the agent pays, gets clean-looking JSON, and
> uses a quote whose spread quietly breaks the published limit. Nothing looks
> wrong.
>
> With it, clause four, reject. And it refuses the data.

### Close (4:00–4:10)

**Screen:** the landing page, or the explorer with the settled payments.

> Every x402 service built at this hackathon has the same hole. Recourse is the
> layer that closes it, and it works end to end today. Real payments, a real
> enclave verdict, a real refund.

---

## Things not to say

Easy to overreach under time pressure, and each of these is checkable:

- Don't say the workflow is **deployed**. It runs through `simulate --broadcast`,
  which writes real transactions but is not a deployed CRE workflow.
- Don't say **no node operator can ever see** the payload. Say it stayed
  confidential from the workflow operators and was never published on chain.
- Don't call the replay **live**. It's a replay of a real payment, and saying so
  costs nothing.
- Don't say the verdict judges **data quality**. It enforces a published SLA.
  That's the narrower and much stronger claim.
