import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: { proxyClientMaxBodySize: "21mb" },
  async rewrites() {
    const origin = (process.env.AUTH_BACKEND_ORIGIN || "http://localhost:5080").replace(/\/$/, "");
    return [
      { source: "/Common/v1/:path*", destination: `${origin}/Common/v1/:path*` },
      { source: "/api/v1/auth/:path*", destination: `${origin}/api/v1/auth/:path*` },
      { source: "/Tickets/v1/:path*", destination: `${origin}/Tickets/v1/:path*` },
      { source: "/hubs/tickets/:path*", destination: `${origin}/hubs/tickets/:path*` },
    ];
  },
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
