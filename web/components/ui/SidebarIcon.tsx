/**
 * SidebarIcon — the chat-history panel toggle glyph.
 *
 * Replaces lucide's `PanelLeftOpen`/`PanelLeftClose`, which read dated at bar
 * size: a 2px-stroke box with a chevron crammed inside, plus a badge dot that
 * floated off the button's padding corner with nothing anchoring it.
 *
 * This is drawn in the SF Symbols `sidebar.leading` idiom the rest of the iOS
 * app lives next to — a soft-cornered panel with a filled leading rail, so the
 * mark reads as "a list beside the content" instead of a generic box. The
 * lighter 1.6 stroke matches the optical weight of the back chevron sitting
 * beside it in the bar.
 *
 * "You have saved conversations" is signalled by tinting the rail itself with
 * the accent instead of parking a dot outside the mark. A badge dot at this
 * size either overlaps the stroke or floats off the corner looking bolted on —
 * a lit rail says the same thing (the list has something in it), reads at
 * 20px, and stays part of the glyph.
 */

interface SidebarIconProps {
    /** Tint the rail — the user has saved conversations. */
    badge?: boolean;
    className?: string;
}

export default function SidebarIcon({ badge = false, className = 'w-5 h-5' }: SidebarIconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            {/* The leading rail — the history list itself. A soft fill rather
                than another stroke keeps the mark quiet at 20px. */}
            <path
                d="M9.25 4.75H7A2.25 2.25 0 0 0 4.75 7v10A2.25 2.25 0 0 0 7 19.25h2.25Z"
                className={badge ? 'fill-accent' : 'fill-current'}
                opacity={badge ? 0.65 : 0.22}
            />
            {/* Panel outline + the divider between list and conversation. */}
            <rect
                x="4.75"
                y="4.75"
                width="14.5"
                height="14.5"
                rx="3.25"
                stroke="currentColor"
                strokeWidth="1.6"
            />
            <path
                d="M9.25 4.75v14.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
        </svg>
    );
}
