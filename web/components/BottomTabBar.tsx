'use client';

import { useEffect, useRef, useState } from 'react';
import { Home, Layers, Plus, MessagesSquare, Newspaper } from 'lucide-react';
import { hapticLight, hapticMedium } from '@/lib/haptics';

export type BottomTab = 'home' | 'collections' | 'ask' | 'digest';

/**
 * The native-app bottom tab bar (phones only — desktop keeps the toolbar
 * chips). Five slots: Home, Collections, a raised center Capture action
 * (replaces the mobile FAB), Ask, and Digest.
 *
 * Scroll-away (LinkedIn): the bar slides down out of view while scrolling DOWN
 * and snaps back the instant you scroll UP — the same feel across every tab.
 * The catch is that Home scrolls the window while Collections/Digest scroll
 * their own inner containers, so we listen on `document` in the CAPTURE phase
 * (scroll doesn't bubble, but capture still sees every scroller) and read the
 * position off whichever element fired. On a tab change we reset to shown so a
 * newly opened screen never starts with the bar tucked away.
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
    const [hidden, setHidden] = useState(false);
    const lastY = useRef(0);
    const lastTarget = useRef<EventTarget | null>(null);

    // New screen → always show the bar (its scroller starts at the top).
    useEffect(() => { setHidden(false); lastTarget.current = null; }, [active]);

    useEffect(() => {
        const TOP_LOCK = 40;   // within this many px of the top, always shown
        const DELTA = 6;       // ignore sub-pixel jitter before committing
        const onScroll = (e: Event) => {
            const t = e.target;
            const isDoc = t === document || t === document.documentElement || t === document.body;
            const el = isDoc ? null : (t as HTMLElement);
            const y = el ? el.scrollTop : window.scrollY;
            // Scroller changed (switched view / focus) — rebase, no delta.
            if (t !== lastTarget.current) { lastTarget.current = t; lastY.current = y; return; }
            const dy = y - lastY.current;
            lastY.current = y;
            if (y < TOP_LOCK) setHidden(false);
            else if (dy > DELTA) setHidden(true);
            else if (dy < -DELTA) setHidden(false);
        };
        document.addEventListener('scroll', onScroll, { capture: true, passive: true });
        return () => document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    }, []);

    const tabs: { key: BottomTab; label: string; icon: React.ReactNode; tour?: string }[] = [
        { key: 'home', label: 'Home', icon: <Home className="w-[20px] h-[20px]" /> },
        { key: 'collections', label: 'Collections', icon: <Layers className="w-[20px] h-[20px]" />, tour: 'collections' },
        { key: 'ask', label: 'Ask', icon: <MessagesSquare className="w-[20px] h-[20px]" />, tour: 'ask' },
        { key: 'digest', label: 'Digest', icon: <Newspaper className="w-[20px] h-[20px]" /> },
    ];

    return (
        <nav
            aria-label="Main"
            className={`sm:hidden fixed inset-x-0 bottom-0 z-40 bg-background/85 backdrop-blur-xl border-t border-border-subtle transition-transform duration-300 [transition-timing-function:var(--ease-modal)] motion-reduce:transition-none ${hidden ? 'translate-y-full' : 'translate-y-0'}`}
            style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom) - 18px), 4px)' }}
        >
            {/* hairline accent glow above the bar — the header's, mirrored. */}
            <div className="absolute inset-x-0 top-0 h-px bg-[image:var(--accent-gradient)] opacity-30" />
            <div className="flex items-center justify-around h-[42px] px-1">
                {tabs.slice(0, 2).map((t) => <TabButton key={t.key} tab={t} active={active === t.key} onSelect={onSelect} />)}
                {/* Center capture — raised above the bar line, the app's core act. */}
                <button
                    data-tour="add"
                    aria-label="Add to Machina"
                    onClick={() => { hapticMedium(); onCapture(); }}
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
