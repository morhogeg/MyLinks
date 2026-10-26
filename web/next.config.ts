import type { NextConfig } from "next";

/**
 * Crawlers asking for the home page get the landing page's static twin.
 *
 * `/` is the app: its prerendered HTML is the boot shell (33 characters of
 * text), and the landing page only appears after `AuthProvider` resolves to
 * signed-out in the browser. AI crawlers (GPTBot, ClaudeBot, PerplexityBot…)
 * and link-preview bots don't run JavaScript, so to them the home page said
 * nothing. `/welcome` is the same landing page prerendered with no auth
 * (`lib/publicRoutes.tsx`), so serving it for `/` to these user agents gives
 * them exactly what a signed-out visitor sees, in plain HTML. People are
 * never matched: no browser's user agent contains these tokens.
 */
const CRAWLER_UA =
  ".*(bot|Bot|crawler|Crawler|spider|Spider|facebookexternalhit|meta-externalagent|"
  + "ChatGPT-User|Claude-User|Perplexity-User|MistralAI-User|WhatsApp|"
  + "Google-InspectionTool|Google-Extended|Chrome-Lighthouse).*";

// Firebase Hosting serves a static export (-> web/out).
// Vercel builds Next.js natively (it sets VERCEL=1); a static 'export'
// there breaks routing (no routes-manifest.json), so skip export on Vercel.
// Rewrites only exist on Vercel for the same reason: a static export has no
// server to apply them, and the iOS bundle never serves crawlers.
const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "export",
  images: {
    unoptimized: true,
  },
  ...(process.env.VERCEL
    ? {
        async rewrites() {
          return {
            beforeFiles: [
              {
                source: "/",
                has: [{ type: "header", key: "user-agent", value: CRAWLER_UA }],
                destination: "/welcome",
              },
            ],
            afterFiles: [],
            fallback: [],
          };
        },
      }
    : {}),
};

export default nextConfig;
