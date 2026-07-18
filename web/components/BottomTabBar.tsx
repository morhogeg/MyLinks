'use client';

import { Home, Layers, Plus, MessagesSquare, Newspaper } from 'lucide-react';
import { hapticLight, hapticMedium } from '@/lib/haptics';

export type BottomTab = 'home' | 'collections' | 'ask' | 'digest';

/**
 * The native-app bottom tab bar (phones only — desktop keeps the toolbar
 * chips). Five slots: Home, Collections, a center Capture action (replaces the
 * mobile FAB), Ask, and Digest.
 *
 * Scroll-away is CONTROLLED via the `hidden` prop (see useScrollAwayBar), so the
 * bar and the tab overlays react to the same signal — the bar slides down while
 * the overlay grows to reclaim the freed space. The slide is via `bottom`, not
 * transform: the bar's backdrop-filter (frosted glass) drops transforms in some
 * engines, so `bottom` is the reliable one.
 */
export default function BottomTabBar({
    active,
    onSelect,
    onCapture,
    hidden = false,
}: {
    active: BottomTab;
    onSelect: (tab: BottomTab) => void;
    onCapture: () => void;
    hidden?: boolean;
}) {
    const tabs: { key: BottomTab; label: string; icon: React.ReactNode; tour?: string }[] = [
        { key: 'home', label: 'Home', icon: <Home className="w-[20px] h-[20px]" /> },
        { key: 'collections', label: 'Collections', icon: <Layers className="w-[20px] h-[20px]" />, tour: 'collections' },
        { key: 'ask', label: 'Ask', icon: <MessagesSquare className="w-[20px] h-[20px]" />, tour: 'ask' },
        { key: 'digest', label: 'Digest', icon: <Newspaper className="w-[20px] h-[20px]" /> },
    ];

    return (
        <nav
            aria-label="Main"
            className="sm:hidden fixed inset-x-0 z-40 bg-background/85 backdrop-blur-xl border-t border-border-subtle transition-[bottom] duration-300 [transition-timing-function:var(--ease-modal)] motion-reduce:transition-none"
            style={{
                paddingBottom: 'max(calc(env(safe-area-inset-bottom) - 18px), 4px)',
                // Slide via `bottom`, NOT transform: this bar has
                // backdrop-filter (frosted glass), which silently drops any
                // transform in WebKit/WKWebView — so translateY did nothing and
                // the bar never actually hid. `bottom` animates reliably. -90px
                // clears the tallest bar (row + safe-area pad) plus its shadow.
                bottom: hidden ? '-90px' : '0px',
            }}
        >
            {/* hairline accent glow above the bar — the header's, mirrored. */}
            <div className="absolute inset-x-0 top-0 h-px bg-[image:var(--accent-gradient)] opacity-30" />
            <div className="flex items-center justify-around h-[44px] px-1">
                {tabs.slice(0, 2).map((t) => <TabButton key={t.key} tab={t} active={active === t.key} onSelect={onSelect} />)}
                {/* Center capture — the app's core act. CONTAINED within the bar
                    (no upward overhang): a raised button poked above the bar and
                    got clipped by the full-screen Collections/Digest overlays and
                    left a sliver when the bar slid away. A shadow gives it depth
                    instead of an offset, so it still reads as the hero action. */}
                <button
                    data-tour="add"
                    aria-label="Add to Machina"
                    onClick={() => { hapticMedium(); onCapture(); }}
                    className="w-[40px] h-[40px] shrink-0 rounded-full bg-[image:var(--accent-gradient)] text-white flex items-center justify-center shadow-lg shadow-accent/40 active:scale-95 transition-transform"
                >
                    <Plus className="w-[20px] h-[20px]" strokeWidth={2.4} />
                </button>
                {tabs.slice(2).map((t) => <TabButton key={t.key} tab={t} active={active === t.key} onSelect={onSelect} />)}
            </div>
        </nav>
    );
}

function TabButton({
    tab, active, onSelect,
}: {
    tab: { key: BottomTab; label: string; icon: React.ReactNode; tour?: string };
    active: boolean;
    onSelect: (tab: BottomTab) => void;
}) {
    return (
        <button
            data-tour={tab.tour}
            onClick={() => { if (!active) hapticLight(); onSelect(tab.key); }}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-[2px] h-full min-w-[58px] transition-colors ${active ? 'text-accent' : 'text-[color:var(--tabbar-inactive)] active:text-text'}`}
        >
            {tab.icon}
            <span className="text-[10px] font-semibold leading-none">{tab.label}</span>
        </button>
    );
}
