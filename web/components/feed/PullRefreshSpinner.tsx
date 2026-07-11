import { RefreshCw } from 'lucide-react';

/**
 * Pull-to-refresh spinner (M16) — rides the finger down from just under the
 * safe-area inset and spins while the refetch is in flight. Extracted verbatim
 * from Feed (R-3). Renders nothing until there's pull travel or an active refresh.
 */
export default function PullRefreshSpinner({ pull, refreshing, animating }: { pull: number; refreshing: boolean; animating: boolean }) {
    if (!(pull > 0 || refreshing)) return null;
    return (
        <div
            className="fixed inset-x-0 top-0 z-40 flex justify-center pointer-events-none"
            style={{
                transform: `translateY(calc(env(safe-area-inset-top, 0px) + ${pull}px))`,
                transition: animating ? 'transform 0.3s cubic-bezier(0.32,0.72,0,1)' : 'none',
            }}
            aria-hidden
        >
            <div
                className="mt-1 flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border-subtle shadow-lg"
                style={{ opacity: refreshing ? 1 : Math.min(1, pull / 40) }}
            >
                <RefreshCw
                    className={`w-4 h-4 text-accent ${refreshing ? 'animate-spin' : ''}`}
                    style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
                />
            </div>
        </div>
    );
}
