import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Machina AI",
  description: "How Machina AI collects, uses, and protects your data.",
};

/**
 * Public, static privacy policy (no auth, no client hooks — prerenders under
 * `output: export`). Linked from App Store Connect and in-app Settings.
 * Keep every claim on this page true to the codebase.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-text-secondary hover:text-text transition-colors">
        &larr; Machina AI
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-text">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-text-muted">Last updated: July 3, 2026</p>

      <p className="mt-6 leading-relaxed text-text-secondary">
        Machina AI (&ldquo;Machina&rdquo;, &ldquo;we&rdquo;) is a personal knowledge base: you save
        links, text, and images, and Machina analyzes them with AI so you can search them and ask
        questions about them later. This policy explains what data Machina handles, where it lives,
        and what control you have over it. The short version: your saves are yours, we collect only
        what the product needs to work, we show no ads, we run no tracking, and we never sell data.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">What we collect</h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed text-text-secondary">
        <li>
          <span className="text-text">Account information.</span> When you sign in with Google or
          Apple, we receive your name, email address, and profile photo from Firebase
          Authentication. With Sign in with Apple you can hide your real email address.
        </li>
        <li>
          <span className="text-text">Content you save.</span> The URLs you share, text extracted
          from those pages, titles and preview images, images and screenshots you share, and the
          notes, tags, categories, and collections you add.
        </li>
        <li>
          <span className="text-text">Questions you ask.</span> Your &ldquo;Ask Machina&rdquo;
          questions and the resulting chat history, so you can revisit past conversations.
        </li>
        <li>
          <span className="text-text">Preferences.</span> Your in-app settings, including your
          device timezone, which is used to schedule reminders and digests at sensible local times.
        </li>
        <li>
          <span className="text-text">Product usage and diagnostics.</span> To understand which
          features are used and to catch crashes, Machina records a small number of first-party,
          content-free events — for example that the app was opened, that a save, ask, or export
          happened, or that an error occurred (with the error message and stack trace). These are
          stored in your own workspace in our own database. They never include the content of your
          saves, your titles, URLs, questions, tags, or email, and there is no third-party analytics
          service involved.
        </li>
      </ul>
      <p className="mt-4 leading-relaxed text-text-secondary">
        What we do <span className="text-text">not</span> collect: no third-party analytics or
        tracking SDKs, no advertising identifiers, no location, no contacts, and no browsing history
        beyond the pages you explicitly save.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">How we use your data</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        Everything we collect is used to run the product for you: analyzing saved content
        (summaries, categories, tags, connections between saves), semantic search, answering your
        questions with citations to your own saves, and sending the reminders and digests you turn
        on. We do not use your data for advertising, we do not sell it, and we do not use your
        content to train AI models.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">Where your data lives</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        Your workspace is stored in Google Firebase (Cloud Firestore, Cloud Storage, and Cloud
        Functions) in the United States (us-central1). The web app is served by Vercel. All traffic
        uses HTTPS/TLS.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">Service providers (processors)</h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed text-text-secondary">
        <li>
          <span className="text-text">Google Gemini (AI analysis).</span> The content you save —
          page text, images — and the questions you ask are sent server-side to the Google Gemini
          API to produce summaries, tags, embeddings, and answers. This processing is governed by
          Google&rsquo;s API terms; Machina does not use your content to train models.
        </li>
        <li>
          <span className="text-text">Google Firebase / Google Cloud.</span> Storage, authentication,
          and backend hosting, as described above.
        </li>
        <li>
          <span className="text-text">Vercel.</span> Serves the web application and receives
          standard web-server request logs (such as IP addresses) to do so.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-text">Public share pages</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        Sharing is off by default. If you explicitly publish a card or a collection as a public
        Machina page, a snapshot of that content becomes visible to anyone with the link until you
        unpublish or delete it. Deleting your account does not automatically retract share pages you
        previously published — unpublish them first, or contact us and we will remove them.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">Retention and deletion</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        We keep your data for as long as your account exists. You can delete your account from
        Settings inside the app at any time: this permanently removes your workspace (saved items,
        chats, collections), your uploaded images from storage, and your sign-in record. You can
        also email us and we will delete your account for you.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">Your rights</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        You can access and edit everything you have saved directly in the app, and delete individual
        items or your whole account at any time. Depending on where you live, you may also have
        legal rights to access, correct, delete, or receive a copy of your personal data. To
        exercise any of these, email us at the address below — we respond to every request.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">Security</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        All data is transmitted over HTTPS/TLS. Access to your workspace requires your signed-in
        account, backend requests are verified server-side, and AI provider API keys are kept
        server-side only — never in the app. No system is perfectly secure, but we keep the attack
        surface deliberately small: no third-party SDKs beyond the services listed above.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">Children</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        Machina is not directed at children under 13, and we do not knowingly collect data from
        them. If you believe a child has created an account, contact us and we will delete it.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">Changes</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        If this policy changes, we will update the date at the top of this page, and we will point
        out material changes in the app.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text">Contact</h2>
      <p className="mt-4 leading-relaxed text-text-secondary">
        Questions or requests about your data:{" "}
        <a href="mailto:morhogeg@gmail.com" className="text-accent hover:underline">
          morhogeg@gmail.com
        </a>
      </p>

      <footer className="mt-14 border-t border-border-subtle pt-6 text-sm text-text-muted">
        <a href="/terms" className="hover:text-text transition-colors">Terms of Service</a>
        <span className="mx-2">&middot;</span>
        <Link href="/" className="hover:text-text transition-colors">Machina AI</Link>
      </footer>
    </main>
  );
}
