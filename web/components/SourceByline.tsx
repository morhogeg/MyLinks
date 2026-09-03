'use client';

import { Youtube, Image as ImageIcon, StickyNote, Quote } from 'lucide-react';
import { getPlatform, platformIcon, platformColor, xHandle, instagramHandle, linkedinDisplayName, prettyHost } from '@/lib/platform';
import { CitationGlyph } from '@/components/ui/Wordmark';

/** Machina's own hosts — the ONLY place a "Machina" source name is legitimate
    (a card shared FROM Machina). Anywhere else it's a bad backend fallback that
    should defer to the real publisher host. */
const MACHINA_HOSTS = new Set(['mymachina.app', 'secondbrain-app-94da2.web.app', 'my-links-sable.vercel.app']);

/** The minimal slice of a card the byline reads. A full `Link` satisfies this,
    and so do denormalized card refs (e.g. digest rows) — one byline everywhere,
    including surfaces that only carry a snapshot of the source fields. */
export interface SourceBylineLink {
    url?: string;
    sourceName?: string;
    sourceType?: string;
    /** 'text' = a note card whose body is verbatim shared text; 'answer' = a
        card kept from an Ask answer (see Link). */
    captureType?: string;
    metadata?: { youtubeChannel?: string };
}

/**
 * THE single source byline used on every card surface (feed grid, list rows,
 * detail modal, swipe-review deck). One implementation so the design can never
 * drift between views again — every past "fix the source on screen X" was a
 * symptom of this logic being copy-pasted per component.
 *
 * Airy, minimal: branded platforms keep their brand mark + name/handle; a
 * screenshot/note shows its type icon + label; a plain publisher shows JUST the
 * name (no icon, no pill, no border, no uppercase). All text is muted grey,
 * normal weight; icons carry the brand colour (or muted for screenshot/note).
 * Returns null when there's no meaningful source.
 */
export default function SourceByline({
    link,
    size = 'sm',
    showIcon = true,
    hideLabel = false,
}: {
    link: SourceBylineLink;
    /** sm = cards (12px text, 3.5 icon); md = detail modal (14px, 4 icon). */
    size?: 'sm' | 'md';
    /** Set false where the caller already draws the mark elsewhere (the Ask
     *  citation chip puts it in a leading slot beside the title), so the same
     *  logo never appears twice in one row. */
    showIcon?: boolean;
    /** Drop the label and let the mark speak, for slots too narrow to hold both
     *  (the landing's 168px shelf card, where "ENGINEERING" alone eats half the
     *  header row and the byline truncated to a useless "@…"). Applies ONLY to
     *  sources that HAVE a glyph — a plain publisher is nothing but its name, so
     *  it keeps the name and ignores this. */
    hideLabel?: boolean;
}) {
    const iconCls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
    const icon = (node: React.ReactNode) => (showIcon ? node : null);
    /** The label for a source that also has a glyph — dropped when `hideLabel`
     *  and the glyph is actually being drawn (never leave a byline with nothing
     *  in it). */
    const label = (node: React.ReactNode) => (hideLabel && showIcon ? null : node);
    // `min-w-0` lets the byline shrink inside a flex row; without it the
    // nowrap content sets a floor and the byline pushes OUT of a narrow card
    // (the landing's 168px shelf card clipped "Screenshot" to "Screens" at the
    // card edge). The label spans below all carry `nameCls` (truncate) so what
    // shrinking produces is a proper ellipsis, never a severed word.
    const wrap = `flex items-center gap-1.5 min-w-0 shrink ${size === 'md' ? 'text-sm' : 'text-xs'} text-text-muted whitespace-nowrap max-w-[240px]`;
    const nameCls = 'truncate';

    // A kept Ask answer has no publisher — Machina wrote it. It carries the same
    // Citation mark the app uses for its own voice everywhere else (the chat's
    // citation chips, Machina's read), so the reader recognises it instantly.
    if (link.captureType === 'answer') {
        return (
            <span dir="ltr" className={wrap} title="Machina answer">
                {icon(<CitationGlyph className={`${size === 'md' ? 'h-4' : 'h-3.5'} w-auto shrink-0 text-accent`} />)}
                {label(<span className={nameCls}>Machina answer</span>)}
            </span>
        );
    }

    const platform = getPlatform(link.url);
    const isYouTube = platform === 'youtube' || link.sourceType === 'youtube';
    const youtubeChannel = link.metadata?.youtubeChannel || link.sourceName;
    const xAuthor = platform === 'x' ? xHandle(link.url) : null;
    const isLinkedIn = platform === 'linkedin';
    const linkedInAuthor = isLinkedIn ? linkedinDisplayName(link.url, link.sourceName) : null;
    const isFacebook = platform === 'facebook';
    const fbAuthor = isFacebook && link.sourceName
        && !['facebook', 'screenshot', 'none'].includes(link.sourceName.trim().toLowerCase())
        ? link.sourceName : null;
    const igAuthor = platform === 'instagram' ? instagramHandle(link.sourceName) : null;

    if (isYouTube && youtubeChannel) {
        return (
            <span dir="ltr" className={wrap} title={youtubeChannel}>
                {icon(<Youtube className={`${iconCls} text-red-500 shrink-0`} />)}
                {label(<span className={nameCls}>{youtubeChannel}</span>)}
            </span>
        );
    }
    if (xAuthor) {
        return (
            <span dir="ltr" className={wrap} title={`@${xAuthor}`}>
                {icon(<span className="shrink-0 inline-flex" style={{ color: platformColor('x') }}>{platformIcon('x', iconCls)}</span>)}
                {label(<span className={nameCls}>@{xAuthor}</span>)}
            </span>
        );
    }
    if (isLinkedIn) {
        return (
            <span dir="auto" className={wrap} title={linkedInAuthor || 'LinkedIn'} aria-label={linkedInAuthor || 'LinkedIn'}>
                {icon(<span className="shrink-0 inline-flex" style={{ color: platformColor('linkedin') }}>{platformIcon('linkedin', iconCls)}</span>)}
                {label(linkedInAuthor && <span className={nameCls}>{linkedInAuthor}</span>)}
            </span>
        );
    }
    if (isFacebook) {
        return (
            <span dir="auto" className={wrap} title={fbAuthor || 'Facebook'} aria-label={fbAuthor || 'Facebook'}>
                {icon(<span className="shrink-0 inline-flex" style={{ color: platformColor('facebook') }}>{platformIcon('facebook', iconCls)}</span>)}
                {label(fbAuthor && <span className={nameCls}>{fbAuthor}</span>)}
            </span>
        );
    }
    if (igAuthor) {
        return (
            <span dir="ltr" className={wrap} title={`@${igAuthor}`}>
                {icon(<span className="shrink-0 inline-flex" style={{ color: platformColor('instagram') }}>{platformIcon('instagram', iconCls)}</span>)}
                {label(<span className={nameCls}>@{igAuthor}</span>)}
            </span>
        );
    }
    if (link.sourceType === 'image') {
        return (
            <span className={wrap} title="Screenshot">
                {icon(<ImageIcon className={`${iconCls} shrink-0`} />)}
                {label(<span className={nameCls}>Screenshot</span>)}
            </span>
        );
    }
    if (link.sourceType === 'note') {
        // Shared text and a typed note are both note cards, but they are not the
        // same object and the reader can tell them apart at a glance: a note is
        // something you wrote, text is something you kept. The quote mark says
        // "these are someone else's words, held verbatim".
        const isText = link.captureType === 'text';
        return (
            <span className={wrap} title={isText ? 'Text' : 'Note'}>
                {icon(isText
                    ? <Quote className={`${iconCls} shrink-0`} />
                    : <StickyNote className={`${iconCls} shrink-0`} />)}
                {label(<span className={nameCls}>{isText ? 'Text' : 'Note'}</span>)}
            </span>
        );
    }
    // Plain publisher (Mako, CNN…): just the name, airy. But reject the junk
    // fallbacks — "Screenshot"/"None", and a "Machina"-flavored name unless the
    // card genuinely came from a Machina host. A rejected name falls back to the
    // link's prettified host, so an existing bad card silently reads correctly.
    const rawName = link.sourceName?.trim();
    let host = '';
    try { host = new URL(link.url ?? '').hostname.replace(/^www\./, '').toLowerCase(); } catch { /* no/invalid url */ }
    const nameRejected =
        !rawName ||
        rawName === 'Screenshot' ||
        rawName === 'None' ||
        (/machina/i.test(rawName) && !MACHINA_HOSTS.has(host));
    const displayName = !nameRejected ? rawName : link.url ? prettyHost(link.url) : null;
    if (displayName) {
        return (
            <span dir="auto" className={`min-w-0 ${size === 'md' ? 'text-sm' : 'text-xs'} text-text-muted whitespace-nowrap truncate max-w-[240px]`} title={displayName}>
                {displayName}
            </span>
        );
    }
    return null;
}
