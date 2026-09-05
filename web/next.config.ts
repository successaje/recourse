import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The explorer reads chain state through route handlers rather than from the
  // browser, so RPC endpoints stay server-side and CORS never enters into it.
  experimental: { typedRoutes: true },

  // @recourse/sla is linked from source and written in NodeNext style, so its
  // internal imports carry `.js` extensions that resolve to `.ts` files. bun and
  // tsc do that mapping already; webpack needs telling. Importing the package
  // rather than copying it keeps one implementation of the canonical hash —
  // two copies that drift is exactly the failure the hash exists to prevent.
  transpilePackages: ['@recourse/sla'],
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },
};

export default config;
