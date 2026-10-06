/**
 * Category color mapping with RGB values for inline styles
 */

interface CategoryColorStyle {
    backgroundColor: string;
    /** The slot's hue as an rgb() string: dots, fills, the graph's canvas. */
    color: string;
    borderColor: string;
    /** TEXT on the tinted chip: a theme variable (globals.css --cat-ink-*),
     *  darker in light mode. `color` read 1.7-3.8:1 there as text (launch
     *  audit A11Y-2); every slot's ink is 4.5:1+ on its tint over the
     *  background, card and card-hover grounds in both themes. */
    ink: string;
}

const categoryColorStyles: Record<string, CategoryColorStyle> = {
    /* Was the old brand purple (#A855F7). The identity is achromatic now, so
       this slot is graphite — the key stays 'purple' because collections
       persist it in Firestore, and name-hash fallbacks land here too. */
    purple: {
        backgroundColor: 'rgba(100, 116, 139, 0.12)',
        color: 'rgb(100, 116, 139)',
        borderColor: 'rgba(100, 116, 139, 0.22)',
        ink: 'var(--cat-ink-purple)',
    },
    blue: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        color: 'rgb(59, 130, 246)',
        borderColor: 'rgba(59, 130, 246, 0.2)',
        ink: 'var(--cat-ink-blue)',
    },
    green: {
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        color: 'rgb(34, 197, 94)',
        borderColor: 'rgba(34, 197, 94, 0.2)',
        ink: 'var(--cat-ink-green)',
    },
    yellow: {
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        color: 'rgb(234, 179, 8)',
        borderColor: 'rgba(234, 179, 8, 0.2)',
        ink: 'var(--cat-ink-yellow)',
    },
    red: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        color: 'rgb(239, 68, 68)',
        borderColor: 'rgba(239, 68, 68, 0.2)',
        ink: 'var(--cat-ink-red)',
    },
    pink: {
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        color: 'rgb(236, 72, 153)',
        borderColor: 'rgba(236, 72, 153, 0.2)',
        ink: 'var(--cat-ink-pink)',
    },
    indigo: {
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        color: 'rgb(99, 102, 241)',
        borderColor: 'rgba(99, 102, 241, 0.2)',
        ink: 'var(--cat-ink-indigo)',
    },
    teal: {
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        color: 'rgb(20, 184, 166)',
        borderColor: 'rgba(20, 184, 166, 0.2)',
        ink: 'var(--cat-ink-teal)',
    },
    orange: {
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        color: 'rgb(249, 115, 22)',
        borderColor: 'rgba(249, 115, 22, 0.2)',
        ink: 'var(--cat-ink-orange)',
    },
    cyan: {
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        color: 'rgb(6, 182, 212)',
        borderColor: 'rgba(6, 182, 212, 0.2)',
        ink: 'var(--cat-ink-cyan)',
    },
};

const colorKeys = Object.keys(categoryColorStyles);

/** The named palette keys (purple, blue, …) — used by the collection color picker. */
export const COLOR_KEYS = colorKeys;

/** Inline style for a specific palette key, falling back to a hashed style. */
export function getColorStyleByKey(key?: string): CategoryColorStyle {
    if (key && categoryColorStyles[key]) return categoryColorStyles[key];
    return getCategoryColorStyle(key || '');
}

/** The old name-hash rule: a category's color slot from its spelling alone.
 *  Different categories often land on the same slot (owner QA 2026-10-01:
 *  Tech/Health both orange, Career/Travel both red), so the app only uses it
 *  for static demo content and once the palette is exhausted. */
function hashSlot(category: string): number {
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % colorKeys.length;
}

/**
 * Hash-only style: the same color on every device, whatever the user's
 * library holds. For static demo content (landing page, onboarding mocks),
 * which must render identically on the server and for a signed-out visitor.
 */
export function getStaticCategoryColorStyle(category: string): CategoryColorStyle {
    return categoryColorStyles[colorKeys[hashSlot(category)]];
}

// ── Per-library assignment (G2c) ───────────────────────────────────────────
// Each of the user's categories gets its OWN palette slot: the first time a
// category is seen it takes the next free slot in SPREAD order (neighbouring
// picks are far apart in hue, so two categories never read as one, the way
// blue next to indigo did); most-used categories pick first; graphite only
// once every chromatic slot is taken, and past the palette's size categories
// share by hash again. Once assigned, a
// category keeps its color (stored per device), so saving a new card never
// recolors the library. Keys are case-insensitive, like the graph's merge.
const STORE_KEY = 'machina.categoryColors.v1';
const GRAPHITE = 'purple';
const SPREAD = ['blue', 'orange', 'green', 'pink', 'yellow', 'teal', 'red', 'indigo', 'cyan'];
let assigned: Record<string, string> | null = null;

function loadAssigned(): Record<string, string> | null {
    if (assigned) return assigned;
    if (typeof window === 'undefined') return null; // server: never cache shared state
    assigned = {};
    try {
        const raw = window.localStorage.getItem(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string' && categoryColorStyles[v]) assigned[k] = v;
            }
        }
    } catch { /* storage blocked or corrupt: start fresh */ }
    return assigned;
}

/**
 * Pure assignment step (exported for tests): give every category in `names`
 * (duplicates allowed; they weigh the order) a distinct slot, keeping the
 * slots in `previous` wherever they don't collide. Returns the new map.
 */
export function assignSlots(names: readonly string[], previous: Record<string, string>): Record<string, string> {
    const counts = new Map<string, number>();
    for (const n of names) {
        const k = n.trim().toLowerCase();
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    // Most-used first: if anything has to give way, it is a rare category.
    const order = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b));
    const next: Record<string, string> = { ...previous };
    const taken = new Set<string>();
    const fresh: string[] = [];
    for (const k of order) {
        const slot = previous[k];
        if (slot && !taken.has(slot)) taken.add(slot);
        else fresh.push(k);
    }
    for (const k of fresh) {
        let slot = SPREAD.find((c) => !taken.has(c));
        if (!slot && !taken.has(GRAPHITE)) slot = GRAPHITE;
        if (slot) {
            next[k] = slot;
            taken.add(slot);
        } else {
            delete next[k]; // palette exhausted: share by hash
        }
    }
    return next;
}

/**
 * Register the library's categories (call with every card's category; Feed
 * does it during render, before its children paint). Cheap when nothing new
 * appeared; persists only when the map changed.
 */
export function assignCategoryColors(categories: readonly string[]): void {
    const current = loadAssigned();
    if (!current) return;
    const next = assignSlots(categories, current);
    const changed = Object.keys(next).length !== Object.keys(current).length
        || Object.entries(next).some(([k, v]) => current[k] !== v);
    if (!changed) return;
    assigned = next;
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* in-memory only */ }
}

/**
 * Inline styles for a category: its assigned slot in this library, else the
 * name hash.
 */
export function getCategoryColorStyle(category: string): CategoryColorStyle {
    const slot = loadAssigned()?.[category.trim().toLowerCase()];
    if (slot) return categoryColorStyles[slot];
    return getStaticCategoryColorStyle(category);
}
