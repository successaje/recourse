import type { Metadata } from 'next';
import { Reveal } from '@/components/reveal';
import { ASSERTION_OFFSET, REASONS } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Protocol',
  description:
    'How Recourse holds a payment, proves what was delivered, adjudicates deterministically inside an enclave, and settles across chains.',
};

export default function ProtocolPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-8">
      <p className="label">Protocol</p>
      <h1 className="mt-4 max-w-[18ch] text-[clamp(1.9rem,4vw,2.8rem)] leading-tight">
        How a dispute is settled without trusting anyone
      </h1>
      <p className="text-text-2 mt-5 max-w-[62ch] text-[16.5px] leading-relaxed">
        Three problems have to be solved before an escrow for machine payments is worth
        anything: proving what was delivered, judging it reproducibly, and doing both
        without publishing the thing the buyer paid to keep private.
      </p>

      <Evidence />
      <Determinism />
      <Confidentiality />
      <Codes />
      <Constraints />
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line-soft mt-20 border-t pt-14">
      <p className="label">{eyebrow}</p>
      <h2 className="mt-4 max-w-[24ch] text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">{title}</h2>
      <div className="mt-6 max-w-[68ch]">{children}</div>
    </section>
  );
}

function Evidence() {
  return (
    <Section eyebrow="Problem one" title="Neither side can lie about what was delivered">
      <p className="text-text-2 text-[16px] leading-relaxed">
        This is where most escrow designs fall over. If the buyer supplies the disputed
        response, they can paste in garbage and claim a refund. If the seller supplies
        it, they can produce a perfect answer they never actually sent.
      </p>

      <Reveal>
        <div className="border-line bg-surface/40 mt-8 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-3">
          {[
            {
              step: 'Seller signs',
              detail: 'sig( paymentId ‖ keccak(body) )',
              note: 'Fixes the hash. Cannot deny it later.',
            },
            {
              step: 'Buyer submits',
              detail: 'the body, and that signature',
              note: 'Supplies the bytes. Cannot swap them.',
            },
            {
              step: 'Enclave checks',
              detail: 'keccak(body) == signed hash',
              note: 'Mismatch ends the case before merit.',
            },
          ].map((c) => (
            <div key={c.step} className="bg-ink/40 p-6">
              <p className="text-text text-[14.5px] font-600">{c.step}</p>
              <p className="mono text-brass mt-2 text-[12.5px]">{c.detail}</p>
              <p className="text-text-3 mt-2.5 text-[13px] leading-relaxed">{c.note}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <p className="text-text-2 mt-8 text-[16px] leading-relaxed">
        The hash is fixed by the seller and the bytes come from the buyer, so a case is
        only judged on merit once the two agree. Neither party has to be trusted and no
        witness has to be paid.
      </p>
      <p className="text-text-2 mt-4 text-[16px] leading-relaxed">
        A seller that withholds the signature gains nothing by it. The buyer opens a
        receipt challenge, the seller gets a grace period to produce the receipt, and
        silence refunds the buyer.
      </p>
    </Section>
  );
}

function Determinism() {
  return (
    <Section eyebrow="Problem two" title="The judge cannot be a language model">
      <p className="text-text-2 text-[16px] leading-relaxed">
        The instinct is to put a model in the enclave and ask whether the response looked
        right. That breaks the protocol. An enclave result is attested and verified by
        DON consensus, which requires the same input to produce the same output every
        time — and a model does not.
      </p>

      <blockquote className="border-brass text-text mt-7 border-l-2 pl-5 text-[15px] leading-relaxed italic">
        Keep it deterministic for a given input — the enclave result is attested and
        verified by DON consensus before the workflow completes.
        <footer className="text-text-3 mt-2 text-[12.5px] not-italic">
          Chainlink CRE SDK, confidential workflow template
        </footer>
      </blockquote>

      <p className="text-text-2 mt-7 text-[16px] leading-relaxed">
        So the model moves upstream, where non-determinism costs nothing. It helps a
        seller author a machine-checkable SLA: a set of assertions over the response,
        content-addressed and agreed before any money moves. The enclave then does
        something more defensible than judging — it enforces a contract both sides
        already signed.
      </p>

      <Reveal>
        <pre className="border-line bg-surface mono mt-8 overflow-x-auto rounded-lg border p-5 text-[12.5px] leading-relaxed">
          <code className="text-text-2">{`{
  "op": "numeric.lte",   "path": "$.spreadBps",  "value": 50,
  "note": "spread within 50bps"
}`}</code>
        </pre>
      </Reveal>

      <p className="text-text-2 mt-6 text-[16px] leading-relaxed">
        Every operator is a pure function of the payload. Numeric comparisons refuse
        numeric strings, so a seller cannot ship the wrong type and pass. Patterns are
        anchored at both ends, because an unanchored pattern matches on substrings and
        that is nearly always the opposite of the promise intended.
      </p>
      <p className="text-text-2 mt-4 text-[16px] leading-relaxed">
        Freshness is checked from two timestamps inside the signed body rather than
        against a clock, so the verdict cannot be skewed by how long a buyer waits before
        disputing.
      </p>
    </Section>
  );
}

function Confidentiality() {
  return (
    <Section eyebrow="Problem three" title="The rules are public, the data is not">
      <p className="text-text-2 text-[16px] leading-relaxed">
        Adjudication requires reading the disputed payload — exactly the thing a buyer
        paid to keep private. A trading signal, a credit decision, a medical summary.
        Publishing it to settle a fifty-cent argument is worse than eating the loss.
      </p>

      <Reveal>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="border-enclave/40 bg-surface/40 rounded-lg border border-dashed p-6">
            <p className="label text-enclave">Sealed in the enclave</p>
            <ul className="text-text-2 mt-4 space-y-2 text-[14px]">
              <li>Request and response bodies</li>
              <li>The SLA document</li>
              <li>Any vault secrets</li>
              <li>Which clause failed, and why</li>
            </ul>
          </div>
          <div className="border-line bg-surface/40 rounded-lg border p-6">
            <p className="label">Crosses out on-chain</p>
            <ul className="text-text-2 mono mt-4 space-y-2 text-[13px]">
              <li>paymentId</li>
              <li>outcome · APPROVE | REJECT</li>
              <li>reasonCode · uint16</li>
              <li>enclave attestation</li>
            </ul>
          </div>
        </div>
      </Reveal>

      <p className="text-text-2 mt-8 text-[16px] leading-relaxed">
        One precision worth stating, because it is easy to claim the opposite: the
        workflow binary is handed to the enclave by the Workflow DON and is{' '}
        <strong className="text-text font-600">public</strong>. Confidentiality covers
        the data it computes over, never the logic. That is the right way round — the
        rules being auditable is the point, and a judge whose reasoning is secret is not
        a judge worth trusting.
      </p>
    </Section>
  );
}

function Codes() {
  return (
    <Section eyebrow="Reading a verdict" title="A refund names the promise that broke">
      <p className="text-text-2 text-[16px] leading-relaxed">
        Verdicts settle with a <code className="mono text-brass text-[14px]">uint16</code>{' '}
        reason code. Codes at or above {ASSERTION_OFFSET} are a failed clause, and the
        index points at a specific published assertion — so a refund is attributable
        rather than a matter of opinion.
      </p>

      <div className="border-line mt-8 overflow-hidden rounded-lg border">
        <table className="w-full border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-line bg-surface-2/60 border-b">
              <th className="label px-4 py-3 font-500">Code</th>
              <th className="label px-4 py-3 font-500">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(REASONS).map(([code, label]) => (
              <tr key={code} className="border-line-soft border-b last:border-0">
                <td className="mono text-text-2 px-4 py-2.5">{code}</td>
                <td className="text-text-2 px-4 py-2.5">{label}</td>
              </tr>
            ))}
            <tr className="bg-surface/40">
              <td className="mono text-brass px-4 py-2.5">{ASSERTION_OFFSET} + n</td>
              <td className="text-text px-4 py-2.5">Clause n of the SLA failed</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-text-3 mt-5 text-[14px] leading-relaxed">
        Reason 102 — the one from the live run — is clause 2: a positive-bid assertion,
        broken by a quote that came back negative.
      </p>
    </Section>
  );
}

function Constraints() {
  return (
    <Section eyebrow="Architecture" title="Two shapes forced by platform limits">
      <div className="space-y-8">
        <div>
          <h3 className="text-text text-[15.5px]">CRE cannot write to Hedera</h3>
          <p className="text-text-2 mt-2.5 text-[15.5px] leading-relaxed">
            Of the 57 chains a CRE tenant can target, Hedera is not one — there is no
            forwarder for a report to reach. So the enclave writes its verdict to
            Ethereum Sepolia, where a forwarder verifies the DON signatures, and CCIP
            carries it the rest of the way. Every hop is authenticated: DON signatures on
            Sepolia, CCIP provenance on Hedera. No privileged operator sits anywhere in
            that path.
          </p>
        </div>

        <div>
          <h3 className="text-text text-[15.5px]">CRE cannot watch Hedera either</h3>
          <p className="text-text-2 mt-2.5 text-[15.5px] leading-relaxed">
            Nothing can subscribe to the dispute event, so the adjudicator sweeps a queue
            instead. That queue is untrusted by design. The enclave re-reads the payment
            from chain at a pinned block and verifies both hashes before judging
            anything, so a dishonest index can delay a verdict or waste a sweep — it can
            never change one.
          </p>
        </div>

        <div>
          <h3 className="text-text text-[15.5px]">A stalled dispute still resolves</h3>
          <p className="text-text-2 mt-2.5 text-[15.5px] leading-relaxed">
            If the workflow pauses, the relay runs dry, or a lane stalls, the payment
            would otherwise sit forever. After a timeout anyone can settle it and the
            buyer is made whole, bond included — they posted it in good faith and it is
            the adjudicator, not the buyer, that failed. Every state has a way out,
            including the one where the machinery itself breaks.
          </p>
        </div>
      </div>
    </Section>
  );
}
