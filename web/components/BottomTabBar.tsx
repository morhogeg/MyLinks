'use client';

import { Home, Layers, Plus, MessagesSquare, Newspaper } from 'lucide-react';
import { useHeaderFade } from '@/lib/useHeaderFade';
import { hapticSelection, hapticLight } from '@/lib/haptics';

export type BottomTab = 'home' | 'collections' | 'ask' | 'digest';

/**
 * The native-app bottom tab bar (phones only — desktop keeps the toolbar
 * chips). Five slots: Home, Collections, a raised center Capture action
 * (replaces the mobile FAB), Ask, and Digest.
 *
 * Scroll behavior mirrors the top header exactly: useHeaderFade drives a
 * direction-scrubbed fade (scroll down = away, any scroll up = back), so both
 * bars breathe together and content gets the whole screen while reading.
 */
export default function BottomTabBar({
    active,
    onSelect,
    onCapture,
}: {
    active: BottomTab;
    onSelect: (tab: BottomTab) => void;
    onCapture: () => void;
}) {
    const barRef = useHeaderFade<HTMLElement>('bottom');

    const tabs: { key: BottomTab; label: string; icon: React.ReactNode; tour?: string }[] = [
        { key: 'home', label: 'Home', icon: <Home className="w-[20px] h-[20px]" /> },
        { key: 'collections', label: 'Collections', icon: <Layers className="w-[20px] h-[20px]" />, tour: 'collections' },
        { key: 'ask', label: 'Ask', icon: <MessagesSquare className="w-[20px] h-[20px]" />, tour: 'ask' },
        { key: 'digest', label: 'Digest', icon: <Newspaper className="w-[20px] h-[20px]" /> },
    ];

    return (
        <nav
            ref={barRef}
            aria-label="Main"
            className="sm:hidden fixed inset-x-0 bottom-0 z-40 bg-background/85 backdrop-blur-xl border-t border-border-subtle"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            {/* hairline accent glow above the bar — the header's, mirrored. */}
            <div className="absolute inset-x-0 top-0 h-px bg-[image:var(--accent-gradient)] opacity-30" />
            <div className="flex items-center justify-around h-[42px] px-1">
                {tabs.slice(0, 2).map((t) => <TabButton key={t.key} tab={t} active={active === t.key} onSelect={onSelect} />)}
                {/* Center capture — raised above the bar line, the app's core act. */}
                <button
                    data-tour="add"
                    aria-label="Add to Machina"
                    onClick={() => { hapticLight(); onCapture(); }}
                    className="relative -top-[11px] w-[46px] h-[46px] shrink-0 rounded-full bg-[image:var(--accent-gradient)] text-white flex items-center justify-center shadow-lg shadow-accent/30 ring-4 ring-background active:scale-95 transition-transform"
                >
                    <Plus className="w-[21px] h-[21px]" strokeWidth={2.4} />
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
            onClick={() => { if (!active) hapticSelection(); onSelect(tab.key); }}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-[2px] h-full min-w-[58px] transition-colors ${active ? 'text-accent' : 'text-[color:var(--tabbar-inactive)] active:text-text'}`}
        >
            {tab.icon}
            <span className="text-[10px] font-semibold leading-none">{tab.label}</span>
        </button>
    );
}
