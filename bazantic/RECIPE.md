# Recipe: buying data you can get refunded for

**Service:** Recourse — `/v1/adjudicate`, `/v1/sla/hash`, `/v1/payments/{id}`
**Pairs with:** any x402 seller settling on Hedera through Blocky402

## When to use this

Reach for Recourse whenever you are about to **pay for data before you can see
it** — which, under x402, is every time.

x402 settles the payment first and returns the response second. If what comes
back is empty, stale, malformed, or simply wrong, the money is already gone. A
human notices and stops buying. An agent making thousands of calls an hour does
not notice, and has no refund path to reach for.

Use it when:

- you are buying from a seller you have not used before, or do not control
- the response feeds a decision that is expensive to get wrong (a trade, a
  quote you will honour, a fact you are about to assert to a user)
- you are running unattended and nobody will read an error log today

Do **not** use it when the call is free, when you already trust the seller and
the data is cheap to re-fetch, or when no SLA exists — with nothing published to
check against, there is nothing to adjudicate and you should just re-request.

## Why it beats checking the response yourself

You could write your own validation. The reason to call this instead:

1. **The verdict is the same one the chain will enforce.** `/v1/adjudicate` runs
   the identical code that executes inside the Chainlink CRE enclave when a
   dispute goes on-chain. Agreeing with your own validator is worth nothing;
   agreeing with the adjudicator is what gets you refunded.
2. **It names the clause.** A rejection comes back as a reason code that is the
   1-based index of the promise that broke, plus the clause itself. You can log
   "clause 4, spread exceeded 50bps" rather than "response looked wrong".
3. **It is deterministic.** Same SLA, same body, same verdict, every time, for
   you and for the seller and for the enclave. There is nothing to argue about.

## How to use it

### Step 1 — get the terms before you pay

Call the seller with no payment. The `402` carries the price and, if the seller
supports Recourse, a `recourse` block naming the SLA:

```
GET https://seller.example/quote
→ 402
{
  "accepts": [{ "scheme": "exact", "network": "hedera:testnet",
                "amount": "10000000", "payTo": "0.0.10380390", ... }],
  "recourse": { "paymentId": "0x…", "slaHash": "0x…", "slaUrl": "https://…" }
}
```

### Step 2 — check the SLA is the one advertised

Fetch `slaUrl`, then confirm it hashes to `slaHash`:

```
POST /v1/sla/hash        (free)
{ "sla": { … } }
→ { "slaHash": "0x83b2a584…" }
```

If it does not match the `402`, **stop**. The seller is quoting terms it is not
publishing, and there is nothing to hold it to.

### Step 3 — pay and collect the receipt

Settle over x402 as usual. A Recourse seller returns three extra headers with
the response:

- `X-Recourse-Payment-Id`
- `X-Recourse-Response-Hash`
- `X-Recourse-Receipt` — the seller's signature over what it just sent

**If those headers are absent, treat the response as undisputable** and do not
rely on it. Without the signature nothing can be proven later.

### Step 4 — judge it

```
POST /v1/adjudicate      (0.01 HBAR via x402)
{
  "sla": { … },
  "response": { "body": "<the raw bytes>", "contentType": "application/json" }
}
```

Returns:

```
{ "verdict": "REJECT",
  "reasonCode": 4,
  "failedClause": { "index": 4, "op": "numeric.lte", "path": "$.spreadBps",
                    "note": "spread within 50bps" },
  "detail": "clause 4 failed: numeric.lte at $.spreadBps" }
```

`APPROVE` → use the data. `REJECT` → do not use it, and dispute.

### Step 5 — get the money back

Call `dispute(paymentId, responseHash, sellerSig)` on the escrow with a bond
(10% of the payment). The dispute is adjudicated inside a TEE, the verdict
crosses to Hedera, and a `REJECT` refunds the payment **and** your bond.

Track it with `GET /v1/payments/{paymentId}` until `stateName` is `Settled`.

## Reading the answer

| Reason code | Meaning |
| --- | --- |
| `0` | Approved; every clause held |
| `1`–`999` | 1-based index of the clause that failed |
| `1000` | Body was not valid JSON |
| `1001` | Content-Type did not match the SLA |
| `1002` | A required field was missing |
| `1003` | Slower than the SLA allowed |
| `1004` | Body did not match the seller's signed receipt |
| `1005` | SLA did not match the hash committed on-chain |

A code of `1004` means the evidence itself is inconsistent — the body you hold
is not what the seller signed. That is not a refund; it means one of you has the
wrong bytes.

## Costs and limits

- Adjudication: **0.01 HBAR** per call. Hashing and payment lookups are free.
- Only worth disputing when the payment exceeds the bond plus your gas.
- The adjudicator judges **against a published SLA**. It has no opinion on
  whether data is *true* — only on whether it broke a promise the seller made.
  A seller that promises nothing cannot be held to anything, which is itself a
  useful signal when choosing who to buy from.
