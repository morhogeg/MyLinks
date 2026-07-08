import { describe, it, expect } from 'vitest';
import { getSourceInfo, sourceMatchesQuery, buildSourceFacets } from '@/lib/source';

// Minimal shape getSourceInfo reads from a Link.
const card = (url: string, sourceName?: string, sourceType?: string) =>
    ({ url, sourceName, sourceType }) as any;

describe('getSourceInfo', () => {
    it('maps an X/Twitter status URL to the author handle', () => {
        const info = getSourceInfo(card('https://x.com/naval/status/123'));
        expect(info.platform).toBe('x');
        expect(info.key).toBe('x:@naval');
        expect(info.label).toBe('@naval');
    });

    it('uses a real publisher name when present', () => {
        const info = getSourceInfo(card('https://www.ynet.co.il/article/1', 'Ynet'));
        expect(info.label).toBe('Ynet');
        expect(info.key).toBe('ynet');
    });

    it('treats a generic placeholder sourceName as no publisher (falls back to host)', () => {
        const info = getSourceInfo(card('https://example.com/x', 'unknown'));
        expect(info.key.startsWith('host:')).toBe(true);
    });

    it('labels a screenshot with no source as "Screenshot"', () => {
        const info = getSourceInfo(card('', undefined, 'image'));
        expect(info.isScreenshot).toBe(true);
        expect(info.key).toBe('screenshot');
    });
});

describe('sourceMatchesQuery', () => {
    const x = getSourceInfo(card('https://x.com/naval/status/1'));
    const ynet = getSourceInfo(card('https://ynet.co.il/a', 'Ynet'));

    it('matches an X source by the "twitter" alias', () => {
        expect(sourceMatchesQuery(x, 'twitter')).toBe(true);
        expect(sourceMatchesQuery(x, 'x')).toBe(true);
    });

    it('matches a publisher by a word-prefix', () => {
        expect(sourceMatchesQuery(ynet, 'yn')).toBe(true);
        expect(sourceMatchesQuery(ynet, 'ynet')).toBe(true);
    });

    it('does NOT match a mid-word letter', () => {
        const perplexity = getSourceInfo(card('https://perplexity.ai/a', 'Perplexity'));
        expect(sourceMatchesQuery(perplexity, 'x')).toBe(false);
    });

    it('empty query never matches', () => {
        expect(sourceMatchesQuery(ynet, '   ')).toBe(false);
    });
});

describe('buildSourceFacets', () => {
    it('dedupes by key, counts, and ranks by count desc then label', () => {
        const facets = buildSourceFacets([
            card('https://ynet.co.il/1', 'Ynet'),
            card('https://ynet.co.il/2', 'Ynet'),
            card('https://x.com/naval/status/1'),
        ]);
        expect(facets[0].label).toBe('Ynet'); // count 2 ranks first
        expect(facets[0].count).toBe(2);
        expect(facets.find((f) => f.key === 'x:@naval')!.count).toBe(1);
    });
});
