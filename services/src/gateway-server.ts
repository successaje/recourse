/**
 * Local entry point for the gateway.
 *
 * Kept separate from `gateway.ts` so that module stays a pure Hono app with no
 * runtime bootstrap in it. The deployed copy is mounted as a Next route handler
 * and never runs this file, and `Bun.serve` would not survive that bundler.
 */
import { gateway } from './gateway.js';
import { config, ESCROW_ACCOUNT_ID, ESCROW_EVM_ADDRESS } from './lib/config.js';

const port = Number(process.env['GATEWAY_PORT'] ?? '8404');
console.log(`recourse gateway listening on :${port}`);
console.log(`  openapi: http://localhost:${port}/v1/openapi.json`);
console.log(`  escrow:  ${ESCROW_EVM_ADDRESS} (${ESCROW_ACCOUNT_ID})`);
void config;
Bun.serve({ port, fetch: gateway.fetch });
