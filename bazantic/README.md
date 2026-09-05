# Bazantic submission

Target track: **Best Recipe Using ETHGlobal Hackathon Sponsor APIs** ($1,000).
The Recipe combines this project with Hedera's x402 rail, and the final answer
depends on both: the verdict comes from Recourse, and it is only produced once
the call has been paid for and settled on Hedera through Blocky402.

Track 3 (*Agentify a New API*) is also arguable — dispute adjudication for
agentic payments did not exist on Bazantic or any other sponsor at the start of
the event — but the requirements ask for a second service alongside it, so the
same pairing applies either way.

## What is built

| Piece | Where |
| --- | --- |
| Gateway service | `services/src/gateway.ts` — run with `bun run gateway` |
| OpenAPI spec | `GET /v1/openapi.json` (served by the gateway) |
| Recipe | [`RECIPE.md`](./RECIPE.md) |

### Endpoints

| Endpoint | Price | Purpose |
| --- | --- | --- |
| `POST /v1/adjudicate` | 0.01 HBAR (x402) | Judge a response against its SLA; returns the clause that broke |
| `POST /v1/sla/hash` | free | Canonical hash, so buyer and seller name the same terms |
| `GET /v1/payments/{id}` | free | On-chain state of a Recourse payment |
| `GET /v1/openapi.json` | free | Machine-readable description |

Adjudication is charged to the gateway's own Hedera account, **not** the escrow.
Escrow deposits are earmarked for a delivery and become bindable by the next
caller, so ordinary revenue must never be sent there.

## Steps that need a human

I cannot do these — they require creating and signing into an account:

1. **Create the bazantic.com account.** Note the username (email or GitHub
   handle); the submission has to include it.
2. **Deploy the Gateway.** The gateway must be reachable from Bazantic, so it
   needs a public URL rather than `localhost`. Either deploy `services/` or
   tunnel it (`cloudflared tunnel --url http://localhost:8404`), then set
   `servers[0].url` in the OpenAPI to that address.
3. **Create the Recipe** on Bazantic, using [`RECIPE.md`](./RECIPE.md) as its
   content.
4. **Record the screen capture.** The requirement is a recording of an agent
   completing a task through the Recipe, where the result depends on both
   services.

## Suggested recording

The contrast that makes the point is between an agent that pays and accepts
whatever arrives, and one that pays and checks:

1. Ask the agent to fetch a quote and act on it. Point the seller at
   `?misbehave=spread`, which returns a quote whose spread breaks the published
   50bps ceiling while looking entirely plausible.
2. **Without the Recipe:** the agent has the raw API, pays, gets a well-formed
   JSON quote, and uses it. Nothing looks wrong.
3. **With the Recipe:** the agent verifies the SLA hash, pays, calls
   `/v1/adjudicate`, gets `REJECT reason 4 — clause 4, numeric.lte at
   $.spreadBps`, refuses the data and disputes.
4. Show `GET /v1/payments/{id}` going to `Settled` and the refund arriving.

The seller's other `?misbehave=` values (`stale`, `negative`, `malformed`,
`missing`, `wrong-type`) each break exactly one clause, if a different failure
demos better.
