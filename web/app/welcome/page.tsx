import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";

export const metadata: Metadata = {
  title: "Machina: Everything you save, finally useful.",
  description:
    "Machina is one place that holds everything you save: links, screenshots and videos from every app. It reads each save, summarizes it, files it, and lets you ask your own library a question and get an answer with sources.",
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
 * `onGetStarted` is deliberately omitted: there is no auth context here, so the
 * CTA renders as a link to `/`.
 */
export default function WelcomePage() {
  return <LandingPage />;
}
