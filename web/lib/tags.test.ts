import { describe, it, expect } from 'vitest';
import { buildTagTree } from '@/lib/tags';

describe('buildTagTree', () => {
    it('nests hierarchical tags under a shared parent', () => {
        const tree = buildTagTree(
            ['ai/agents', 'ai/rag', 'cooking'],
            { 'ai/agents': 2, 'ai/rag': 3, cooking: 1 },
        );
        const ai = tree.find((n) => n.name === 'ai')!;
        expect(ai).toBeDefined();
        expect(ai.children.map((c) => c.name)).toEqual(['agents', 'rag']); // sorted A–Z
        expect(ai.fullName).toBe('ai');
        expect(ai.children[0].fullName).toBe('ai/agents');
    });

    it('parent count is the sum of itself + all descendants (prefix match)', () => {
        const tree = buildTagTree(['ai', 'ai/agents', 'ai/rag'], {
            ai: 1,
            'ai/agents': 2,
            'ai/rag': 3,
        });
        const ai = tree.find((n) => n.name === 'ai')!;
        expect(ai.count).toBe(6); // 1 + 2 + 3
        expect(ai.children.find((c) => c.name === 'agents')!.count).toBe(2);
    });

    it('does not let a sibling prefix ("ai" vs "aircraft") bleed into the count', () => {
        const tree = buildTagTree(['ai', 'aircraft'], { ai: 4, aircraft: 9 });
        const ai = tree.find((n) => n.name === 'ai')!;
        expect(ai.count).toBe(4); // must NOT include "aircraft"
    });

    it('sorts top-level nodes alphabetically', () => {
        const tree = buildTagTree(['zeta', 'alpha', 'mu'], { zeta: 1, alpha: 1, mu: 1 });
        expect(tree.map((n) => n.name)).toEqual(['alpha', 'mu', 'zeta']);
    });
});
