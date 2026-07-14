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
  title: "Machina AI",
  description: "Your AI-powered knowledge capture and retrieval system",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Machina AI",
  },
  icons: {
    apple: "/apple-touch-icon.png",
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
        <meta name="apple-mobile-web-app-title" content="Machina AI" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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

