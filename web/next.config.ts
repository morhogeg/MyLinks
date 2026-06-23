import type { NextConfig } from "next";

// Firebase Hosting serves a static export (-> web/out).
// Vercel builds Next.js natively (it sets VERCEL=1); a static 'export'
// there breaks routing (no routes-manifest.json), so skip export on Vercel.
const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
