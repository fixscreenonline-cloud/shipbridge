import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Browser security headers for every page and API response.
const securityHeaders = [
  // Nobody can show ShipBridge inside a frame on their site (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  // Don't guess file types; send only the origin to other sites.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HTTPS only, for two years (production only, so localhost over http keeps working).
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a production build run next to `npm run dev` without sharing the .next folder.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  async headers() {
    return [
      // Everything except the label file may never be shown inside a frame.
      { source: "/((?!api/label/).*)", headers: securityHeaders },
      // The label file is printed from a hidden frame on our own page, so allow same-site framing only.
      {
        source: "/api/label/:path*",
        headers: securityHeaders.map((h) =>
          h.key === "X-Frame-Options"
            ? { key: "X-Frame-Options", value: "SAMEORIGIN" }
            : h.key === "Content-Security-Policy"
              ? { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'self'" }
              : h,
        ),
      },
      // Admin pages and APIs never go into shared caches.
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
