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
