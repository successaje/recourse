import type { Metadata } from 'next';
import { Reveal } from '@/components/reveal';
import { ESCROW } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Build',
  description:
    'Integrate Recourse: sell under an SLA, buy with a refund path, or call the adjudicator directly.',
};

export default function BuildPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-8">
      <p className="label">Integrate</p>
      <h1 className="mt-4 max-w-[20ch] text-[clamp(1.9rem,4vw,2.8rem)] leading-tight">
        Three ways in, depending on which side you are on
      </h1>
      <p className="text-text-2 mt-5 max-w-[62ch] text-[16.5px] leading-relaxed">
        Recourse is additive. A seller keeps its existing x402 flow and changes where the
        money settles; a buyer keeps its existing client and gains somewhere to appeal.
        Neither has to adopt the whole protocol to get something out of it.
      </p>

      <Path
        n="01"
        title="Call the adjudicator"
        who="Any agent buying from any x402 seller"
        body="The lowest-commitment entry point, and it needs no contracts at all. Send the SLA you agreed to and the response you got, and find out whether it honoured the terms — using the same code that runs inside the enclave. Agreeing with your own validator is worth nothing; agreeing with the adjudicator is what gets you refunded."
        code={`POST /v1/adjudicate          # 0.01 HBAR via x402
{
  "sla": { … },
  "response": { "body": "<raw bytes>",
                "contentType": "application/json" }
}

→ { "verdict": "REJECT",
    "reasonCode": 4,
    "failedClause": { "index": 4, "op": "numeric.lte",
                      "path": "$.spreadBps",
                      "note": "spread within 50bps" } }`}
      />

      <Path
        n="02"
        title="Sell under an SLA"
        who="Anyone running an x402-gated service"
        body="Publish what you promise, quote its hash in the 402, and point payTo at the escrow instead of your own account. Sign a hash of each response before you send it. In exchange, a buyer that disputes has to bring your signature, so you can never be accused of sending something you did not."
        code={`// in the 402
{
  "accepts": [{ "payTo": "${ESCROW.accountId}", … }],
  "recourse": { "paymentId": "0x…",
                "slaHash":   "0x…",
                "slaUrl":    "https://…/sla" }
}

// with the 200
X-Recourse-Response-Hash: 0x…
X-Recourse-Receipt:       0x…   // sig over paymentId ‖ keccak(body)`}
      />

      <Path
        n="03"
        title="Buy with a refund path"
        who="Agents making unattended purchases"
        body="Settle into the escrow, bind the deposit to the terms, then check the response before you use it. If it fails, dispute with a bond and the verdict settles itself. The check is the point: a human notices a bad response and stops buying, and an agent making a thousand calls an hour does not."
        code={`const offer  = await fetch(url);            // 402 + slaHash
const sla    = await verifySlaHash(offer);  // refuse a mismatch
await settle(offer.accepts[0]);             // into escrow
await bind(paymentId, seller, amount, slaHash, window);

const res = await fetch(url, { headers: payment });
const judgement = adjudicate(sla, evidence(res));

if (judgement.verdict === REJECT) {
  await dispute(paymentId, responseHash, sellerSig, bond);
}`}
      />

      <section className="border-line-soft mt-20 border-t pt-14">
        <p className="label">Deployments</p>
        <h2 className="mt-4 text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">Testnet only</h2>
        <p className="text-text-2 mt-5 max-w-[62ch] text-[16px] leading-relaxed">
          The contracts are unaudited and hold testnet value. Two limits worth knowing
          before you build on this: a seller could misstate its own serving time, since
          nothing on-chain attests a clock — the buyer comparing it against local time on
          receipt is the defence. And the adjudicator judges against a published SLA, so
          it has no opinion on whether data is <em>true</em>, only on whether it broke a
          promise. A seller that promises nothing cannot be held to anything, which is
          itself a useful signal when choosing who to buy from.
        </p>

        <div className="border-line mt-8 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2">
          <a
            href={ESCROW.explorer}
            target="_blank"
            rel="noreferrer"
            className="bg-surface/40 hover:bg-surface group p-6 transition-colors"
          >
            <p className="label">Escrow · Hedera testnet</p>
            <p className="mono text-text group-hover:text-brass mt-2 text-[13.5px] transition-colors">
              {ESCROW.address}
            </p>
            <p className="mono text-text-3 mt-1 text-[12.5px]">{ESCROW.accountId}</p>
          </a>
          <a
            href="https://github.com/successaje/recourse"
            target="_blank"
            rel="noreferrer"
            className="bg-surface/40 hover:bg-surface group p-6 transition-colors"
          >
            <p className="label">Source</p>
            <p className="text-text group-hover:text-brass mt-2 text-[13.5px] transition-colors">
              github.com/successaje/recourse
            </p>
            <p className="text-text-3 mt-1 text-[12.5px]">Contracts, SLA judge, enclave workflow</p>
          </a>
        </div>
      </section>
    </div>
  );
}

function Path({
  n,
  title,
  who,
  body,
  code,
}: {
  n: string;
  title: string;
  who: string;
  body: string;
  code: string;
}) {
  return (
    <Reveal>
      <section className="border-line-soft mt-20 grid gap-10 border-t pt-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div>
          <span className="mono text-brass text-[12px]">{n}</span>
          <h2 className="mt-3 text-[clamp(1.35rem,2.2vw,1.7rem)] leading-tight">{title}</h2>
          <p className="text-text-3 mt-2 text-[13px]">{who}</p>
          <p className="text-text-2 mt-5 text-[15.5px] leading-relaxed">{body}</p>
        </div>

        <pre className="border-line bg-surface mono overflow-x-auto rounded-lg border p-5 text-[12.5px] leading-relaxed">
          <code className="text-text-2">{code}</code>
        </pre>
      </section>
    </Reveal>
  );
}
