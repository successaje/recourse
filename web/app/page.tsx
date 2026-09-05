import Link from 'next/link';
import { Demo } from '@/components/demo';
import { FlowDiagram } from '@/components/flow-diagram';
import { Reveal } from '@/components/reveal';
import { ESCROW, PROVEN_RUNS, RELAY } from '@/lib/constants';
import { short } from '@/lib/format';

export default function Home() {
  return (
    <>
      <Hero />
      <Problem />
      <Demo />
      <Lifecycle />
      <Proof />
      <Guarantees />
      <Cta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="gridlines pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-20 sm:pt-32">
        <Reveal onMount>
          <p className="label">Escrow for machine payments</p>
        </Reveal>

        <Reveal delay={0.06} onMount>
          <h1 className="mt-5 max-w-[16ch] text-[clamp(2.6rem,7vw,4.6rem)] leading-[1.02]">
            x402 pays before delivery.
          </h1>
        </Reveal>

        <Reveal delay={0.12} onMount>
          <p className="text-brass mt-3 max-w-[20ch] font-display text-[clamp(1.5rem,3.6vw,2.2rem)] leading-tight">
            Recourse gets the money back.
          </p>
        </Reveal>

        <Reveal delay={0.18} onMount>
          <p className="text-text-2 mt-8 max-w-[54ch] text-[17px] leading-relaxed">
            An agent pays for an API call, and the response is empty, stale, or quietly
            wrong. The money is already gone. Recourse holds the payment in escrow,
            settles the argument inside a trusted enclave, and refunds the buyer when
            the seller broke a promise it published.
          </p>
        </Reveal>

        <Reveal delay={0.24} onMount>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#demo"
              className="bg-brass text-ink hover:bg-brass-glow rounded px-5 py-2.5 text-[14px] font-500 transition-colors"
            >
              Run the live demo
            </a>
            <Link
              href="/protocol"
              className="border-line text-text-2 hover:border-brass-dim hover:text-text rounded border px-5 py-2.5 text-[14px] transition-colors"
            >
              Explore the protocol
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.3} onMount>
          <p className="text-text-3 mt-7 text-[13px]">
            Powered by Hedera · Chainlink CRE · Bazantic
          </p>
        </Reveal>

        <Reveal delay={0.34} onMount>
          <div className="border-line bg-surface/40 mt-16 rounded-lg border p-6 sm:p-10">
            <FlowDiagram />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="rule mb-16" />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <p className="label">The gap</p>
          <h2 className="mt-4 text-[clamp(1.7rem,3vw,2.3rem)] leading-tight">
            Settlement happens before the response exists
          </h2>
        </div>

        <div className="text-text-2 space-y-5 text-[16px] leading-relaxed">
          <p>
            The x402 standard is a clean way for an agent to pay for an HTTP request:
            hit an endpoint, get a <code className="mono text-brass text-[14px]">402</code>{' '}
            with a price, sign a payment, retry. It works. It has one hole.
          </p>
          <p>
            The money moves first. A seller that returns an empty object, a stale
            quote, or a confidently wrong number keeps it.
          </p>
          <p className="text-text border-brass border-l-2 pl-5">
            A human notices and stops buying. An agent making a thousand calls an hour
            does not notice, has no refund path, and keeps paying until somebody reads
            a log.
          </p>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'Terms before money',
    body: 'The seller publishes a machine-checkable SLA and quotes its hash in the 402. The buyer refuses to pay for terms that do not match their own advertised hash.',
  },
  {
    n: '02',
    title: 'Payment lands in escrow',
    body: 'Settlement goes to a contract on Hedera, not the seller. The buyer binds that deposit to the exact terms on-chain, and the seller checks the binding before doing any work.',
  },
  {
    n: '03',
    title: 'The seller signs what it sent',
    body: 'A signature over the response hash comes back with the data. The hash is fixed by the seller and the bytes come from the buyer, so neither side can fabricate the evidence later.',
  },
  {
    n: '04',
    title: 'A dispute is judged, not argued',
    body: 'The buyer posts a bond. A Chainlink CRE enclave re-reads the payment from chain, pulls the evidence over confidential HTTP, and evaluates the SLA deterministically.',
  },
  {
    n: '05',
    title: 'The verdict settles itself',
    body: 'Only the payment id, outcome and reason code leave the enclave. CCIP carries them to Hedera, where the escrow pays the winner. No operator sits anywhere in that path.',
  },
];

function Lifecycle() {
  return (
    <section className="border-line bg-surface/30 border-y">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="label">Lifecycle</p>
        <h2 className="mt-4 max-w-[20ch] text-[clamp(1.7rem,3vw,2.3rem)] leading-tight">
          One paid request, start to finish
        </h2>

        <ol className="mt-14 grid gap-px sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.07}>
              <li className="border-line bg-ink/40 h-full border p-6">
                <span className="mono text-brass text-[12px]">{step.n}</span>
                <h3 className="mt-3 text-[15px] leading-snug font-600">{step.title}</h3>
                <p className="text-text-3 mt-2.5 text-[13.5px] leading-relaxed">{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>

        <p className="text-text-3 mt-10 max-w-[62ch] text-[14px] leading-relaxed">
          The uncontested path never touches an oracle. Funds sit for a short window,
          the seller withdraws, and the whole exchange costs one extra contract call.
          Adjudication is the exception, and only the exception pays for it.
        </p>
      </div>
    </section>
  );
}

function Proof() {
  const { refund, release } = PROVEN_RUNS;

  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <p className="label">Verified on testnet</p>
      <h2 className="mt-4 max-w-[24ch] text-[clamp(1.7rem,3vw,2.3rem)] leading-tight">
        Both paths, with transaction hashes
      </h2>
      <p className="text-text-2 mt-4 max-w-[58ch] text-[16px] leading-relaxed">
        Not a mockup. These are real payments, a real enclave verdict, and money that
        actually moved.
      </p>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <article className="border-refund/30 bg-surface/40 h-full rounded-lg border p-7">
            <div className="flex items-center justify-between">
              <span className="mono text-refund text-[12px]">REJECT · reason 102</span>
              <span className="text-text-3 text-[12px]">bad response</span>
            </div>
            <h3 className="mt-4 text-[17px]">Buyer refunded 0.11 HBAR</h3>
            <p className="text-text-2 mt-2.5 text-[14px] leading-relaxed">
              The seller returned a negative bid. Reason 102 is offset 100 plus clause 2
              — <code className="mono text-[13px]">numeric.gt</code> on{' '}
              <code className="mono text-[13px]">$.bid</code>. The refund names a
              published promise, not an opinion. The bond came back too, because the
              buyer was right.
            </p>
            <dl className="border-line-soft mt-6 space-y-2.5 border-t pt-5 text-[12.5px]">
              <Row label="Payment" value={short(refund.paymentId, 8, 6)} />
              <Row
                label="Verdict on Sepolia"
                value={short(refund.sepoliaTx, 8, 6)}
                href={`https://sepolia.etherscan.io/tx/${refund.sepoliaTx}`}
              />
              <Row label="CCIP message" value={short(refund.ccipMessage, 8, 6)} />
            </dl>
          </article>
        </Reveal>

        <Reveal delay={0.1}>
          <article className="border-release/30 bg-surface/40 h-full rounded-lg border p-7">
            <div className="flex items-center justify-between">
              <span className="mono text-release text-[12px]">APPROVE</span>
              <span className="text-text-3 text-[12px]">honest response</span>
            </div>
            <h3 className="mt-4 text-[17px]">Seller paid 0.1 HBAR</h3>
            <p className="text-text-2 mt-2.5 text-[14px] leading-relaxed">
              All five clauses held, so there was nothing to dispute. The window lapsed
              and the seller withdrew in a single call — no oracle, no adjudication, no
              cross-chain hop. This is the common case, and it is deliberately the
              cheapest one.
            </p>
            <dl className="border-line-soft mt-6 space-y-2.5 border-t pt-5 text-[12.5px]">
              <Row label="Payment" value={short(release.paymentId, 8, 6)} />
              <Row label="Release" value={short(release.releaseTx, 8, 6)} />
              <Row label="Oracle cost" value="none" />
            </dl>
          </article>
        </Reveal>
      </div>

      <div className="border-line mt-8 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-3">
        <Stat label="Escrow · Hedera testnet" value={ESCROW.accountId} href={ESCROW.explorer} />
        <Stat label="Relay · Ethereum Sepolia" value={short(RELAY.address, 6, 4)} href={RELAY.explorer} />
        <Stat label="Verdict to refund" value="~18 min" note="mostly Sepolia finality" />
      </div>
    </section>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-3">{label}</dt>
      <dd className="mono text-text-2">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="hover:text-brass transition-colors">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Stat({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const inner = (
    <>
      <p className="label">{label}</p>
      <p className="mono text-text mt-2 text-[15px]">{value}</p>
      {note && <p className="text-text-3 mt-1 text-[12.5px]">{note}</p>}
    </>
  );
  return (
    <div className="bg-surface/40 p-6">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="hover:[&_p:nth-child(2)]:text-brass block transition-colors">
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

const GUARANTEES = [
  {
    title: 'Neither side can lie about the delivery',
    body: 'The seller fixes the hash by signing it; the buyer supplies the bytes. A dispute is only judged on merit once the two agree, so no witness has to be paid and neither party has to be trusted.',
  },
  {
    title: 'The judge cannot be a language model',
    body: 'An enclave result is attested and verified by consensus, which requires the same input to produce the same output every time. So the model helps author the SLA up front, and the enclave enforces a contract both sides already signed.',
  },
  {
    title: 'The rules are public, the data is not',
    body: 'The workflow binary is handed to the enclave and is auditable by anyone. Only the disputed payload stays sealed. That is the right way round: you should be able to check the rules and still keep your data private.',
  },
  {
    title: 'A stalled dispute still resolves',
    body: 'If no verdict ever arrives, anyone can settle the payment after a timeout and the buyer is made whole. Every state has a way out, including the one where the adjudicator itself fails.',
  },
];

function Guarantees() {
  return (
    <section className="border-line bg-surface/30 border-y">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="label">Guarantees</p>
        <h2 className="mt-4 max-w-[22ch] text-[clamp(1.7rem,3vw,2.3rem)] leading-tight">
          What holds, and why
        </h2>

        <div className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2">
          {GUARANTEES.map((g, i) => (
            <Reveal key={g.title} delay={i * 0.06}>
              <div>
                <div className="bg-brass mb-4 h-px w-8" />
                <h3 className="text-[16.5px] leading-snug">{g.title}</h3>
                <p className="text-text-2 mt-3 text-[14.5px] leading-relaxed">{g.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-28 text-center">
      <h2 className="mx-auto max-w-[20ch] text-[clamp(1.9rem,4vw,2.8rem)] leading-tight">
        Every x402 service has this hole
      </h2>
      <p className="text-text-2 mx-auto mt-5 max-w-[52ch] text-[16px] leading-relaxed">
        If you are building one, the buyer on the other end has no way to get its money
        back today. Closing that takes one change to where the payment goes.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link
          href="/build"
          className="bg-brass text-ink hover:bg-brass-glow rounded px-6 py-3 text-[14px] font-500 transition-colors"
        >
          Integrate Recourse
        </Link>
        <Link
          href="/protocol"
          className="border-line text-text-2 hover:border-brass-dim hover:text-text rounded border px-6 py-3 text-[14px] transition-colors"
        >
          Read the protocol
        </Link>
      </div>
    </section>
  );
}
