import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Machina AI",
  description: "How Machina AI collects, uses, and protects your data.",
};

/**
 * Public, static privacy policy (no auth, no client hooks — prerenders under
 * `output: export`). Linked from App Store Connect and in-app Settings.
 *
 * Structure: a plain-language summary panel, then the numbered policy proper
 * (mirrors the section numbering of /terms). The summary is a reading aid —
 * §13 says the numbered policy governs, so the two can never be read as
 * competing documents.
 *
 * Keep every claim on this page true to the codebase. The factual sections —
 * §2, §4, §5 especially — were derived from the backend source, not written
 * aspirationally; if the payload changes, this page changes with it.
 *
 * JSX GOTCHA: a space after `</span>` is DROPPED when the same text run
 * contains an HTML entity (&rsquo;, &ldquo;) — the entity splits the run and
 * the leading space is trimmed, rendering "Saving a link.The text…". Every
 * bold label below is therefore followed by an explicit {" "}, uniformly, so
 * the bug can't reappear when someone adds an entity to an existing line.
 */

/** A numbered policy section — keeps heading rhythm and anchor ids in one place. */
function Section({ id, n, title, children }: {
  id: string; n: number; title: string; children: ReactNode;
}) {
  return (
    <>
      <h2 id={id} className="mt-10 scroll-mt-6 text-xl font-semibold text-text">
        {n}. {title}
      </h2>
      {children}
    </>
  );
}

/** One line of the summary panel: a bold promise, then the plain-language gloss. */
function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="leading-relaxed text-text-secondary">
      <span className="text-text font-medium">{title}</span>{" "}
      {children}
    </li>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-text-secondary hover:text-text transition-colors">
        &larr; Machina AI
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-text">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-text-muted">Last updated: July 27, 2026</p>

      <p className="mt-6 leading-relaxed text-text-secondary">
        Machina AI (&ldquo;Machina&rdquo;, &ldquo;we&rdquo;) is a personal knowledge base: you save
        links, text, and images, and Machina analyzes them with AI so you can search them and ask
        questions about them later. Doing that means handling things you wrote and things you chose
        to keep, so this policy is specific rather than general — it names the companies involved
        and lists what each feature actually sends them.
      </p>

      {/* ── Summary ─────────────────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-border-subtle bg-card p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          In short
        </h2>
        <ul className="mt-4 space-y-3">
          <Point title="Your saves are yours.">
            We show no ads, we sell nothing, and there is no third-party tracking or analytics in
            Machina at all.
          </Point>
          <Point title="An AI reads what you save, and we name it.">
            Google Gemini writes your summaries, tags, and answers.{" "}
            <a href="#gemini" className="text-accent underline underline-offset-2">Section 4</a>{" "}
            lists exactly what each feature sends it.
          </Point>
          <Point title="Your content is never used to train an AI model.">
            Machina runs on Gemini&rsquo;s paid tier, where Google&rsquo;s terms forbid using your
            content to train or improve Google&rsquo;s models.
          </Point>
          <Point title="Google is never told who you are.">
            No name, email, phone number, or IP address goes with those requests — they come from
            our servers, not from your device.
          </Point>
          <Point title="Private cards stay out of the AI entirely.">
            Once a card is private, nothing about it is sent to Gemini again.{" "}
            <a href="#private" className="text-accent underline underline-offset-2">Section 5</a>{" "}
            explains the two limits on that, honestly.
          </Point>
          <Point title="You can take everything, or delete everything.">
            A full export and permanent account deletion are both in Settings, available at any
            time, with no need to ask us.
          </Point>
        </ul>
        <p className="mt-5 text-sm leading-relaxed text-text-muted">
          This summary is here to be read, not to be relied on: the numbered policy below is the one
          that governs. Nothing in the summary contradicts it.
        </p>
      </section>

      {/* ── Policy ──────────────────────────────────────────── */}

      <Section id="who" n={1} title="Who we are">
        <p className="mt-4 leading-relaxed text-text-secondary">
          Machina AI is an independent app operated from Israel by its developer, who is the data
          controller for the personal data described here. For any privacy question or request,
          including the rights described in{" "}
          <a href="#rights" className="text-accent underline underline-offset-2">section 10</a>, contact{" "}
          <a href="mailto:morhogeg@gmail.com" className="text-accent hover:underline">
            morhogeg@gmail.com
          </a>
          . This policy covers the Machina iOS app, the Machina web app, and the browser extension.
        </p>
      </Section>

      <Section id="collect" n={2} title="What we collect">
        <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed text-text-secondary">
          <li>
            <span className="text-text">Account information.</span>{" "}
            When you sign in with Google or Apple we receive your name, email address, and profile
            photo from Firebase Authentication. Sign in with Apple lets you hide your real email
            address, and Machina works normally if you do.
          </li>
          <li>
            <span className="text-text">Content you save.</span>{" "}
            The addresses you share, text extracted from those pages, titles and preview images,
            images and screenshots you share, and the notes, tags, categories, and collections you
            add yourself.
          </li>
          <li>
            <span className="text-text">Questions you ask.</span>{" "}
            Your &ldquo;Ask Machina&rdquo; questions and the resulting chat history, so you can
            revisit past conversations.
          </li>
          <li>
            <span className="text-text">Preferences.</span>{" "}
            Your in-app settings, including your device timezone, which is used to schedule
            reminders and digests at sensible local times.
          </li>
          <li>
            <span className="text-text">Product usage and diagnostics.</span>{" "}
            To understand which features are used and to catch crashes, Machina records a small
            number of first-party, content-free events — that the app was opened, that a save, ask,
            or export happened, or that an error occurred, with its message and stack trace. These
            live in your own workspace in our own database. They never include the content of your
            saves, your titles, addresses, questions, tags, or email, and no third-party analytics
            service is involved.
          </li>
        </ul>
        <p className="mt-4 leading-relaxed text-text-secondary">
          What we do <span className="text-text">not</span> collect: no third-party analytics or
          tracking SDKs, no advertising identifiers, no location, no contacts, and no browsing
          history beyond the pages you explicitly choose to save.
        </p>
      </Section>

      <Section id="use" n={3} title="How we use your data, and on what basis">
        <p className="mt-4 leading-relaxed text-text-secondary">
          Everything we collect is used to run the product for you: analyzing saved content into
          summaries, categories, tags, and connections; semantic search; answering your questions
          with citations to your own saves; and sending the reminders and digests you switch on. We
          do not use your data for advertising and we do not sell it. Your content is not used to
          train AI models — not by us, and not by Google, as described in{" "}
          <a href="#gemini" className="text-accent underline underline-offset-2">section 4</a>.
        </p>
        <p className="mt-4 leading-relaxed text-text-secondary">
          Where data-protection law requires us to name a legal basis, ours are: performing the
          service you asked for (storing and organizing your saves, answering your questions); your
          consent, which you give on first run before any content is sent for AI analysis, and again
          when you enable notifications; and our legitimate interest in keeping the service secure,
          diagnosing failures, and preventing abuse. You can withdraw consent by deleting your
          account, which is described in{" "}
          <a href="#retention" className="text-accent underline underline-offset-2">section 9</a>.
        </p>
      </Section>

      <Section id="gemini" n={4} title="What we send to Google Gemini">
        <p className="mt-4 leading-relaxed text-text-secondary">
          Machina&rsquo;s AI features are powered by the Google Gemini API. This is the part of
          Machina that involves another company, so here is the complete list, feature by feature:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed text-text-secondary">
          <li>
            <span className="text-text">Saving a link.</span>{" "}
            The text of the page we fetched, up to 30,000 characters, and your list of existing tags
            so the new card can reuse them. The link&rsquo;s full address is not sent — only the
            site&rsquo;s name.
          </li>
          <li>
            <span className="text-text">Saving a post with photos, or a screenshot.</span>{" "}
            The above, plus the image itself.
          </li>
          <li>
            <span className="text-text">Saving a YouTube video.</span>{" "}
            The video&rsquo;s address. Google watches the video on its own servers in order to
            summarize it.
          </li>
          <li>
            <span className="text-text">Writing a note.</span>{" "}
            The text of the note.
          </li>
          <li>
            <span className="text-text">Search.</span>{" "}
            A card&rsquo;s summary text, converted into the numeric vector that makes semantic
            search and related-card links work.
          </li>
          <li>
            <span className="text-text">Asking a question.</span>{" "}
            Your question, the last few messages of that conversation, and up to 20 of your saved
            cards — their titles, summaries, details, and{" "}
            <span className="text-text">any notes you wrote on them</span>.
          </li>
          <li>
            <span className="text-text">The weekly synthesis.</span>{" "}
            The titles, summaries, tags, and categories of what you saved that week.
          </li>
        </ul>
        <p className="mt-4 leading-relaxed text-text-secondary">
          What is <span className="text-text">never</span> sent: your name, email address, phone
          number, sign-in token, IP address, or any other account identifier. These requests are
          made by Machina&rsquo;s servers rather than by your device, and every Machina user shares
          a single API key — so Google cannot tell one user&rsquo;s requests from another&rsquo;s,
          let alone connect them to you. What the content itself reveals is a separate matter: a
          note that names its author is still words in a request, and no technical measure changes
          that.
        </p>
        <p className="mt-4 leading-relaxed text-text-secondary">
          Machina uses the <em>paid</em> tier of the Gemini API. Under Google&rsquo;s API terms for
          that tier, your prompts and responses are not used to improve or train Google&rsquo;s
          models, and are not read by reviewers in order to improve them. Google does retain them
          for up to 55 days for the sole purpose of detecting abuse of the API, after which they are
          deleted. One exception sits inside that window and we would rather state it than let you
          discover it: content that Google&rsquo;s automated systems flag as possibly breaking its
          usage policies can be assessed by authorized Google staff, to confirm or overturn the
          flag.
        </p>
      </Section>

      <Section id="private" n={5} title="Private cards">
        <p className="mt-4 leading-relaxed text-text-secondary">
          A card you mark private — on its own, or by placing it in a private collection — is
          excluded from Ask, from digests, and from the weekly synthesis, and its tags are left out
          of the tag list described in{" "}
          <a href="#gemini" className="text-accent underline underline-offset-2">section 4</a>. Once a card is
          private, nothing about it is sent to Gemini again.
        </p>
        <p className="mt-4 leading-relaxed text-text-secondary">
          Two limits on that are worth stating plainly. First, a card is analyzed at the moment you
          save it — that analysis is what produces its summary and tags — so its content did reach
          Gemini then; marking it private afterwards stops all future processing but cannot undo the
          original request. Second, the optional PIN is a lock on the screen of this device, not
          encryption: private cards are stored the same way as everything else in your workspace.
        </p>
      </Section>

      <Section id="processors" n={6} title="Service providers">
        <p className="mt-4 leading-relaxed text-text-secondary">
          We use a deliberately short list of providers, each processing your data only to deliver
          the service:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed text-text-secondary">
          <li>
            <span className="text-text">Google Gemini.</span>{" "}
            AI analysis, summaries, embeddings, and answers, on the terms set out in{" "}
            <a href="#gemini" className="text-accent underline underline-offset-2">section 4</a>.
          </li>
          <li>
            <span className="text-text">Google Firebase and Google Cloud.</span>{" "}
            Storage of your workspace, authentication, file storage, and the backend that runs
            Machina&rsquo;s server-side logic.
          </li>
          <li>
            <span className="text-text">Vercel.</span>{" "}
            Serves the web application, and receives standard web-server request logs, including IP
            addresses, in order to do so.
          </li>
        </ul>
      </Section>

      <Section id="storage" n={7} title="Where your data is stored">
        <p className="mt-4 leading-relaxed text-text-secondary">
          Your workspace is stored in Google Firebase — Cloud Firestore, Cloud Storage, and Cloud
          Functions — in the United States (region us-central1). The web app is served by Vercel.
          All traffic between your device, our servers, and our providers uses HTTPS/TLS.
        </p>
        <p className="mt-4 leading-relaxed text-text-secondary">
          If you use Machina from outside the United States, your data is transferred there and
          processed there. Where such a transfer is restricted by the law of your country — for
          example within the European Economic Area, the United Kingdom, or Switzerland — it relies
          on the safeguards our providers offer for international transfers, including the European
          Commission&rsquo;s Standard Contractual Clauses.
        </p>
      </Section>

      <Section id="sharing" n={8} title="Public share pages">
        <p className="mt-4 leading-relaxed text-text-secondary">
          Sharing is off by default and nothing you save is public unless you choose to publish it.
          If you explicitly publish a card or a collection as a public Machina page, a snapshot of
          that content becomes visible to anyone holding the link, until you unpublish or delete it.
          Deleting your account does not automatically retract share pages you published earlier —
          unpublish them first, or contact us and we will remove them for you.
        </p>
      </Section>

      <Section id="retention" n={9} title="How long we keep your data, and how to delete it">
        <p className="mt-4 leading-relaxed text-text-secondary">
          We keep your data for as long as your account exists, because the product&rsquo;s purpose
          is to still have your saves years from now. Diagnostic error records are an exception and
          are discarded automatically after 14 days.
        </p>
        <p className="mt-4 leading-relaxed text-text-secondary">
          You can delete your account from Settings at any time, without asking us. Doing so
          permanently removes your workspace — saved items, chats, and collections — along with your
          uploaded images and your sign-in record. You can also email us and we will delete the
          account for you. Deletion is not reversible, so export first if you want a copy.
        </p>
      </Section>

      <Section id="rights" n={10} title="Your rights">
        <p className="mt-4 leading-relaxed text-text-secondary">
          You can read, edit, and delete everything you have saved directly in the app, and export
          all of it from Settings as a JSON backup plus a readable Markdown file — no request to us
          required.
        </p>
        <p className="mt-4 leading-relaxed text-text-secondary">
          Depending on where you live, you may also have legal rights to access your personal data,
          correct it, delete it, receive a portable copy, restrict or object to certain processing,
          and withdraw consent you previously gave. To exercise any of these, email us at the
          address in
          <a href="#contact" className="text-accent underline underline-offset-2">section 14</a> — we
          answer every request, and we will not treat you differently for making one. If you are in
          the European Economic Area or the United Kingdom, you also have the right to complain to
          your local data-protection authority.
        </p>
      </Section>

      <Section id="security" n={11} title="Security">
        <p className="mt-4 leading-relaxed text-text-secondary">
          All data is transmitted over HTTPS/TLS. Access to your workspace requires your signed-in
          account, requests to our backend are verified server-side rather than trusted from the
          app, and AI provider API keys exist only on our servers — never in the app or the browser
          bundle. No system is perfectly secure, but we keep the attack surface deliberately small:
          no third-party SDKs beyond the providers listed in{" "}
          <a href="#processors" className="text-accent underline underline-offset-2">section 6</a>.
        </p>
      </Section>

      <Section id="children" n={12} title="Children">
        <p className="mt-4 leading-relaxed text-text-secondary">
          Machina is not directed at children under 13, and we do not knowingly collect data from
          them. If you believe a child has created an account, contact us and we will delete it.
        </p>
      </Section>

      <Section id="changes" n={13} title="Changes to this policy">
        <p className="mt-4 leading-relaxed text-text-secondary">
          If this policy changes we will update the date at the top of this page, and point out
          material changes in the app rather than relying on you to re-read it. Sections 1 to 14 are
          the operative policy; the summary at the top is a plain-language guide to them and does
          not modify or limit anything below.
        </p>
      </Section>

      <Section id="contact" n={14} title="Contact">
        <p className="mt-4 leading-relaxed text-text-secondary">
          Questions or requests about your data:{" "}
          <a href="mailto:morhogeg@gmail.com" className="text-accent hover:underline">
            morhogeg@gmail.com
          </a>
        </p>
      </Section>

      <footer className="mt-14 border-t border-border-subtle pt-6 text-sm text-text-muted">
        <a href="/terms" className="hover:text-text transition-colors">Terms of Service</a>
        <span className="mx-2">&middot;</span>
        <Link href="/" className="hover:text-text transition-colors">Machina AI</Link>
      </footer>
    </main>
  );
}
