'use client';

import type { SlaDocument } from '@recourse/sla';
import { ASSERTION_OFFSET } from '@/lib/constants';

/**
 * The clauses, and which one broke.
 *
 * The escrow stores only a reason code, but that is enough to reconstruct the
 * whole picture: the adjudicator stops at the first failure, so a code of
 * offset+N means clauses before N held, N failed, and the rest were never
 * reached. Showing "not evaluated" rather than a tick for those is the honest
 * rendering — nothing checked them.
 *
 * This is the component that turns "the oracle said no" into "clause 2 said the
 * bid must be positive, and it was not".
 */

type ClauseState = 'passed' | 'failed' | 'unreached' | 'unknown';

function describe(op: string, path: string, value: unknown, otherPath?: string): string {
  switch (op) {
    case 'numeric.gt':
      return `${path} > ${value}`;
    case 'numeric.gte':
      return `${path} ≥ ${value}`;
    case 'numeric.lt':
      return `${path} < ${value}`;
    case 'numeric.lte':
      return `${path} ≤ ${value}`;
    case 'numeric.eq':
      return `${path} = ${value}`;
    case 'string.matches':
      return `${path} matches /${value}/`;
    case 'string.eq':
      return `${path} = "${value}"`;
    case 'string.minLength':
      return `${path} at least ${value} characters`;
    case 'array.minLength':
      return `${path} at least ${value} items`;
    case 'exists':
      return `${path} is present`;
    case 'freshness.maxAgeSec':
      return `${path} at most ${value}s old`;
    case 'freshness.servedWithin':
      return `${otherPath} − ${path} ≤ ${value}s`;
    default:
      return `${op} ${path}`;
  }
}

const MARK: Record<ClauseState, { glyph: string; className: string; label: string }> = {
  passed: { glyph: '✓', className: 'text-release', label: 'Passed' },
  failed: { glyph: '✕', className: 'text-refund', label: 'Failed' },
  unreached: { glyph: '–', className: 'text-text-3', label: 'Not evaluated' },
  unknown: { glyph: '·', className: 'text-text-3', label: '' },
};

export function SlaViewer({
  sla,
  slaHash,
  reasonCode,
}: {
  sla: SlaDocument | null;
  slaHash: string;
  reasonCode?: number;
}) {
  if (!sla) {
    return (
      <div className="border-line bg-surface/40 rounded-lg border p-6">
        <p className="label">Service level agreement</p>
        <p className="mono text-text-2 mt-3 text-[12.5px] break-all">{slaHash}</p>
        <p className="text-text-3 mt-3 text-[13.5px] leading-relaxed">
          The escrow commits to a hash, not the document. These terms were not published
          to this explorer, so the clauses cannot be shown — only that the payment was
          bound to exactly this commitment.
        </p>
      </div>
    );
  }

  const failedClause =
    reasonCode !== undefined && reasonCode >= ASSERTION_OFFSET ? reasonCode - ASSERTION_OFFSET : null;
  const structuralFailure = reasonCode !== undefined && reasonCode > 0 && reasonCode < ASSERTION_OFFSET;
  const approved = reasonCode === 0;

  function stateOf(index1: number): ClauseState {
    if (approved) return 'passed';
    if (failedClause === null) return structuralFailure ? 'unreached' : 'unknown';
    if (index1 < failedClause) return 'passed';
    if (index1 === failedClause) return 'failed';
    return 'unreached';
  }

  return (
    <div className="border-line bg-surface/40 rounded-lg border">
      <div className="border-line-soft border-b p-6">
        <p className="label">Service level agreement</p>
        <p className="text-text mt-2 text-[15px]">{sla.title ?? 'Terms'}</p>
        <p className="mono text-text-3 mt-2 text-[12px] break-all">{slaHash}</p>
      </div>

      <ol>
        {sla.response.assertions.map((a, i) => {
          const n = i + 1;
          const state = stateOf(n);
          const mark = MARK[state];

          return (
            <li key={`${a.op}-${a.path}-${n}`} className="border-line-soft grid grid-cols-[2.5rem_1fr_auto] gap-4 border-b p-5 last:border-0">
              <span className="mono text-text-3 text-[12px]">{String(n).padStart(2, '0')}</span>

              <div>
                <p className="text-text text-[14px]">{a.note ?? a.op}</p>
                <p className="mono text-text-2 mt-1.5 text-[12.5px]">
                  {describe(a.op, a.path, a.value, a.otherPath)}
                </p>
                {state === 'failed' && (
                  <p className="text-refund mt-2 text-[12.5px]">
                    This is the promise the refund was granted under.
                  </p>
                )}
              </div>

              <span className={`text-right text-[12px] ${mark.className}`}>
                <span className="mr-1.5">{mark.glyph}</span>
                {mark.label}
              </span>
            </li>
          );
        })}
      </ol>

      {structuralFailure && (
        <p className="border-line-soft text-text-3 border-t p-5 text-[13px] leading-relaxed">
          The response failed before any clause was reached — it was malformed, the wrong
          content type, or missing a required field.
        </p>
      )}
    </div>
  );
}
