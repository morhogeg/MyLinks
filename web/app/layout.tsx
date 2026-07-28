import type { Metadata, Viewport } from "next";
// Self-hosted Geist (Vercel's `geist` package) instead of next/font/google, so
// the production build never has to reach fonts.googleapis.com at build time —
// it ships the same font from node_modules. Same CSS variable names, so
// globals.css is unchanged.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Machina",
  description: "Your AI-powered knowledge capture and retrieval system",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Machina",
  },
  icons: {
    // Tab icons, declared explicitly and living in public/ rather than as an
    // app/icon.* file convention. Two Next behaviours forced that: an explicit
    // `icons` object (this one already existed for `apple`) suppresses the
    // auto-generated icon links, and app/icon.svg + explicit config together
    // emitted NO icon link at all.
    //
    // PNG IS LISTED FIRST AND IS THE ONE THAT MATTERS. Safari's SVG-favicon
    // support is unreliable, so it fell back to /favicon.ico — a URL that has
    // existed since before the rebrand, which means Safari's per-URL favicon
    // cache kept serving the OLD purple-M bitmap no matter what we wrote into
    // the file. /favicon-32.png is a URL that has never existed before, so
    // there is no cache entry to hit and every browser must fetch it. Keep it
    // that way: if this icon is ever redrawn, ALSO rename the file.
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-180.png", type: "image/png", sizes: "180x180" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    // Same reasoning — a fresh URL, not the long-cached /apple-touch-icon.png.
    apple: "/favicon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#050505",
  viewportFit: "cover",
};

import { ThemeProvider } from "@/components/ThemeProvider";
// AuthGate = AuthProvider everywhere except the public legal pages
// (/privacy, /terms), which App Store review must reach without sign-in.
import { AuthGate } from "@/lib/publicRoutes";
import { ToastProvider } from "@/components/Toast";
import OfflineBanner from "@/components/OfflineBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Render-blocking theme bootstrap: the CSS default is dark (:root), so a
            light-theme user would otherwise get a dark flash (FOUC) every launch
            because ThemeProvider only applies the saved theme in a post-paint
            effect. Set the `light` class synchronously before first paint. Mirrors
            ThemeProvider's resolution ('light' | saved 'system' + OS preference). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var isLight=t==='light'||(t==='system'&&!window.matchMedia('(prefers-color-scheme: dark)').matches);if(isLight){document.documentElement.classList.add('light');}}catch(e){}})();`,
          }}
        />
        {/* PWA iOS meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Machina" />
        {/* No <link rel="apple-touch-icon"> here — `metadata.icons.apple` above
            already emits one, and having both shipped the tag twice. */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-text transition-colors duration-200`}
      >
        <ThemeProvider>
          {/* Global offline banner — mounted above the auth gate so it shows on
              every route (incl. the public legal pages) and both platforms. */}
          <OfflineBanner />
          <AuthGate>
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}

