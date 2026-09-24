export interface TagNode {
    name: string;
    fullName: string;
    children: TagNode[];
    count: number;
    depth: number;
}

/**
 * Builds a hierarchical tree from a flat list of tags
 * Hierarchical tags are expected to use '/' as a separator (e.g., "Work/Project")
 */
export function buildTagTree(
    tags: string[],
    tagCounts: Record<string, number>,
    /**
     * When true, siblings are ranked by count (desc) then name — used when a
     * category filter is active so the tags that actually match float to the top
     * and the 0-count ones sink, instead of being buried alphabetically. When
     * false (the default, no category selected), plain A–Z ordering.
     */
    sortByCount = false,
): TagNode[] {
    const root: TagNode[] = [];

    tags.forEach(tag => {
        const parts = tag.split('/');
        let currentLevel = root;
        let cumulativePath = '';

        parts.forEach((part, index) => {
            cumulativePath = index === 0 ? part : `${cumulativePath}/${part}`;

            let node = currentLevel.find(n => n.name === part);

            if (!node) {
                node = {
                    name: part,
                    fullName: cumulativePath,
                    children: [],
                    count: 0, // Will sum up later or use direct counts
                    depth: index
                };
                currentLevel.push(node);
            }

            // Only add count to the leaf or exact match?
            // Usually, parent count should be sum of children if it doesn't have its own items.
            // But here, a link might have "Work" AND "Work/Project".
            // Let's just use the direct counts from the Record.

            currentLevel = node.children;
        });
    });

    // Populate counts and sort
    const updateCounts = (nodes: TagNode[]) => {
        nodes.forEach(node => {
            // Recurse
            updateCounts(node.children);

            // This is tricky because one link might have both parent and child tags.
            // But let's assume if it has "Work/Task", it implicitly belongs to "Work".
            // For now, let's just show the direct count or sum? 
            // Better: sum of all items that MATCH the prefix.
            node.count = Object.entries(tagCounts)
                .filter(([path]) => path === node.fullName || path.startsWith(`${node.fullName}/`))
                .reduce((sum, [, c]) => sum + c, 0);

            node.children.sort(compareNodes);
        });
    };

    // Rank by count (desc) then A–Z when a category narrows the counts; plain
    // A–Z otherwise so the untouched list stays predictable.
    const compareNodes = (a: TagNode, b: TagNode) =>
        sortByCount && b.count !== a.count
            ? b.count - a.count
            : a.name.localeCompare(b.name);

    updateCounts(root);
    root.sort(compareNodes);

    return root;
}

// ── Case-insensitive tag vocabulary ────────────────────────────────────────
// Tags are stored exactly as typed, so "AI" and "ai" can both exist in a
// library. Everything that GROUPS tags (facet counts, the tag list, filters)
// treats them as one tag, shown under its most-used spelling.

/** The grouping key for a tag: case-insensitive, trimmed. */
export function tagKey(tag: string): string {
    return tag.trim().toLowerCase();
}

/** True when `tag` is `selected` or nested under it ("Work/Project" under
 *  "Work"), ignoring case. */
export function tagMatches(tag: string, selected: string): boolean {
    const t = tagKey(tag);
    const s = tagKey(selected);
    return t === s || t.startsWith(`${s}/`);
}

/** key → the spelling to show: the most-used one, ties to the first seen. */
export function canonicalTagSpellings(tagLists: Iterable<string[]>): Map<string, string> {
    const uses = new Map<string, Map<string, number>>();
    for (const tags of tagLists) {
        for (const tag of tags) {
            const k = tagKey(tag);
            if (!k) continue;
            const m = uses.get(k) ?? new Map<string, number>();
            m.set(tag, (m.get(tag) ?? 0) + 1);
            uses.set(k, m);
        }
    }
    const out = new Map<string, string>();
    uses.forEach((m, k) => {
        let best = '';
        let bestN = -1;
        m.forEach((n, spelling) => { if (n > bestN) { best = spelling; bestN = n; } });
        out.set(k, best);
    });
    return out;
}

/** Rewrite one card's tag list: `from` (any case, plus nested children) →
 *  `to` (null deletes). Order kept, duplicates dropped case-insensitively. */
export function retagList(tags: string[], from: string, to: string | null): string[] {
    const fromKey = tagKey(from);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of tags) {
        let next: string | null = t;
        if (tagMatches(t, from)) {
            if (to === null) next = null;
            else next = to.trim() + t.trim().slice(fromKey.length);
        }
        if (next === null) continue;
        const k = tagKey(next);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(next);
    }
    return out;
}
