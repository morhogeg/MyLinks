'use client';

import { Youtube, Image as ImageIcon, StickyNote } from 'lucide-react';
import { getPlatform, platformIcon, platformColor, xHandle, instagramHandle } from '@/lib/platform';

/** The minimal slice of a card the byline reads. A full `Link` satisfies this,
    and so do denormalized card refs (e.g. digest rows) — one byline everywhere,
    including surfaces that only carry a snapshot of the source fields. */
export interface SourceBylineLink {
    url?: string;
    sourceName?: string;
    sourceType?: string;
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
}: {
    link: SourceBylineLink;
    /** sm = cards (12px text, 3.5 icon); md = detail modal (14px, 4 icon). */
    size?: 'sm' | 'md';
}) {
    const iconCls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
    const wrap = `flex items-center gap-1.5 min-w-0 ${size === 'md' ? 'text-sm' : 'text-xs'} text-text-muted whitespace-nowrap max-w-[240px]`;
    const nameCls = 'truncate';

    const platform = getPlatform(link.url);
    const isYouTube = platform === 'youtube' || link.sourceType === 'youtube';
    const youtubeChannel = link.metadata?.youtubeChannel || link.sourceName;
    const xAuthor = platform === 'x' ? xHandle(link.url) : null;
    const isLinkedIn = platform === 'linkedin';
    const isFacebook = platform === 'facebook';
    const fbAuthor = isFacebook && link.sourceName
        && !['facebook', 'screenshot', 'none'].includes(link.sourceName.trim().toLowerCase())
        ? link.sourceName : null;
    const igAuthor = platform === 'instagram' ? instagramHandle(link.sourceName) : null;

    if (isYouTube && youtubeChannel) {
        return (
            <span dir="ltr" className={wrap} title={youtubeChannel}>
                <Youtube className={`${iconCls} text-red-500 shrink-0`} />
                <span className={nameCls}>{youtubeChannel}</span>
            </span>
        );
    }
    if (xAuthor) {
        return (
            <span dir="ltr" className={wrap} title={`@${xAuthor}`}>
                <span className="shrink-0 inline-flex" style={{ color: platformColor('x') }}>{platformIcon('x', iconCls)}</span>
                <span className={nameCls}>@{xAuthor}</span>
            </span>
        );
    }
    if (isLinkedIn) {
        return (
            <span dir="ltr" className={wrap} title="LinkedIn" aria-label="LinkedIn">
                <span className="shrink-0 inline-flex" style={{ color: platformColor('linkedin') }}>{platformIcon('linkedin', iconCls)}</span>
            </span>
        );
    }
    if (isFacebook) {
        return (
            <span dir="auto" className={wrap} title={fbAuthor || 'Facebook'} aria-label={fbAuthor || 'Facebook'}>
                <span className="shrink-0 inline-flex" style={{ color: platformColor('facebook') }}>{platformIcon('facebook', iconCls)}</span>
                {fbAuthor && <span className={nameCls}>{fbAuthor}</span>}
            </span>
        );
    }
    if (igAuthor) {
        return (
            <span dir="ltr" className={wrap} title={`@${igAuthor}`}>
                <span className="shrink-0 inline-flex" style={{ color: platformColor('instagram') }}>{platformIcon('instagram', iconCls)}</span>
                <span className={nameCls}>@{igAuthor}</span>
            </span>
        );
    }
    if (link.sourceType === 'image') {
        return (
            <span className={wrap} title="Screenshot">
                <ImageIcon className={`${iconCls} shrink-0`} />
                <span>Screenshot</span>
            </span>
        );
    }
    if (link.sourceType === 'note') {
        return (
            <span className={wrap} title="Note">
                <StickyNote className={`${iconCls} shrink-0`} />
                <span>Note</span>
            </span>
        );
    }
    if (link.sourceName && link.sourceName !== 'Screenshot' && link.sourceName !== 'None') {
        // Plain publisher (Mako, CNN…): just the name, airy.
        return (
            <span dir="auto" className={`min-w-0 ${size === 'md' ? 'text-sm' : 'text-xs'} text-text-muted whitespace-nowrap truncate max-w-[240px]`} title={link.sourceName}>
                {link.sourceName}
            </span>
        );
    }
    return null;
}
