import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build id baked into the client; /api/version returns the live one so an app left open can reload itself.
  env: { NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  cacheComponents: true,
  // server PDF: headless Chromium is loaded at runtime, and its binary files must ship with the route
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: { "/api/pdf/**": ["./node_modules/@sparticuz/chromium/bin/**"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
