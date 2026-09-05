import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The explorer reads chain state through route handlers rather than from the
  // browser, so RPC endpoints stay server-side and CORS never enters into it.
  experimental: { typedRoutes: true },
};

export default config;
