/**
 * A deliberately small JSONPath subset.
 *
 * Supports `$`, dot access (`$.a.b`), and non-negative integer indexing
 * (`$.rows[0].id`). No wildcards, filters, recursion or slices — every one of
 * those either needs a search order we would have to guarantee across engines,
 * or opens the door to unbounded work inside the enclave. Anything the grammar
 * does not cover is a malformed SLA, not a runtime surprise.
 */

export type PathSegment = { kind: 'key'; key: string } | { kind: 'index'; index: number };

const SEGMENT = /^([A-Za-z_][A-Za-z0-9_-]*)|^\[(\d+)\]/;

export class PathError extends Error {}

/** Parse a path into segments. Throws `PathError` on anything outside the grammar. */
export function parsePath(path: string): PathSegment[] {
  if (path === '$') return [];
  if (!path.startsWith('$')) throw new PathError(`path must start with "$": ${path}`);

  const segments: PathSegment[] = [];
  let rest = path.slice(1);

  while (rest.length > 0) {
    if (rest.startsWith('.')) {
      rest = rest.slice(1);
      const m = SEGMENT.exec(rest);
      if (!m || m[1] === undefined) throw new PathError(`expected a key after "." in ${path}`);
      segments.push({ kind: 'key', key: m[1] });
      rest = rest.slice(m[1].length);
      continue;
    }

    if (rest.startsWith('[')) {
      const m = SEGMENT.exec(rest);
      if (!m || m[2] === undefined) throw new PathError(`expected an integer index in ${path}`);
      segments.push({ kind: 'index', index: Number.parseInt(m[2], 10) });
      rest = rest.slice(m[2].length + 2);
      continue;
    }

    throw new PathError(`unexpected "${rest[0]}" in ${path}`);
  }

  return segments;
}

/**
 * Resolve a parsed path against a value.
 *
 * Returns `undefined` for anything absent. A JSON `null` resolves to `null`,
 * which is distinct from absent — `exists` relies on that difference.
 */
export function resolve(root: unknown, segments: readonly PathSegment[]): unknown {
  let current: unknown = root;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    if (segment.kind === 'key') {
      if (typeof current !== 'object' || Array.isArray(current)) return undefined;
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, segment.key)) return undefined;
      current = record[segment.key];
      continue;
    }

    if (!Array.isArray(current)) return undefined;
    if (segment.index >= current.length) return undefined;
    current = current[segment.index];
  }

  return current;
}

/** Convenience wrapper: parse and resolve in one step. */
export function readPath(root: unknown, path: string): unknown {
  return resolve(root, parsePath(path));
}
