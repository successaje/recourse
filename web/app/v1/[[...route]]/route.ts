import { gateway } from '@recourse/services/gateway';

/**
 * The agent-facing gateway, mounted on the deployed site.
 *
 * It is the *same* Hono app the local `bun run gateway` serves, imported rather
 * than reimplemented: an adjudication gateway that disagreed with itself
 * depending on where it ran would defeat the point of the thing.
 *
 * Public hosting is what Bazantic needs, since a gateway on localhost cannot be
 * registered. It needs no secrets: every chain read is public, and Blocky402
 * settles from the buyer's signed payload rather than from a seller key.
 *
 * Calling `gateway.fetch` directly rather than going through `hono/vercel`'s
 * `handle` keeps this decoupled from which copy of Hono resolves here. A Hono
 * app is already a `(Request) => Response`, which is exactly a route handler,
 * and the adapter only exists to bridge frameworks that are not.
 */
const handler = (request: Request): Response | Promise<Response> => gateway.fetch(request);

export const GET = handler;
export const POST = handler;

// Chain reads and facilitator calls must not be cached or prerendered.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
