import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";
import { HOME_DESCRIPTION, HOME_TITLE } from "@/lib/site";
import { JsonLd, organization, softwareApplication, website } from "@/lib/seo";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  // `/` is the home page of record; this route is its static twin, and
  // crawlers asking for `/` are served this HTML (next.config.ts), so both
  // URLs consolidate onto the root.
  alternates: { canonical: "/" },
};

/**
 * The landing page as a GENUINELY static route.
 *
 * `/` renders the same component for signed-out web visitors, but only after
 * hydration — the root sits under `AuthProvider`, so what ships in the root's
 * HTML is the boot shell, not this prose. This route sits in `PUBLIC_ROUTES`
 * (`lib/publicRoutes.tsx`) and therefore mounts with NO auth context at all, so
 * the copy is in the prerendered markup under `output: export` and there is one
 * URL that is provably reachable with no auth call and no JavaScript.
 *
 * That is what makes it the safe URL to hand a reviewer. `/` is the canonical
 * home page — it is what Google's branding review and App Store Connect's
 * Support/Marketing rows point at — and this is its floor.
 *
 * It is also what search and AI crawlers read for `/`: on Vercel, a request
 * for `/` from a crawler user agent is rewritten here (`next.config.ts`), so
 * the home page they index is this prose plus the JSON-LD below, not the
 * 33-character boot shell. Same content a signed-out person sees.
 *
 * `onGetStarted` is deliberately omitted: there is no auth context here, so the
 * CTA renders as a link to `/`.
 */
export default function WelcomePage() {
  return (
    <>
      <JsonLd graph={[organization, website, softwareApplication]} />
      <LandingPage />
    </>
  );
}
