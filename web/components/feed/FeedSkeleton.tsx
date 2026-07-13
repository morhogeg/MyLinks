// Loading skeleton for the feed — shown while the first Firestore snapshot
// resolves. Extracted verbatim from Feed (R-3).
export default function FeedSkeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="Loading your links">
            <div className="h-11 rounded-xl bg-card border border-border-subtle relative overflow-hidden skeleton-shimmer" />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div
                        key={i}
                        className="bg-card border border-border-subtle rounded-2xl p-5 relative overflow-hidden skeleton-shimmer surface-card shadow-[var(--shadow-card)]"
                    >
                        <div className="h-3 w-20 bg-fill-strong rounded-full mb-4" />
                        <div className="h-5 w-3/4 bg-fill-strong rounded mb-3" />
                        <div className="space-y-2 mb-5">
                            <div className="h-3 w-full bg-fill-subtle rounded" />
                            <div className="h-3 w-5/6 bg-fill-subtle rounded" />
                            <div className="h-3 w-2/3 bg-fill-subtle rounded" />
                        </div>
                        <div className="flex gap-2">
                            <div className="h-5 w-14 bg-fill-subtle rounded-full" />
                            <div className="h-5 w-16 bg-fill-subtle rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
