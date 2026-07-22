'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Globe, Image as ImageIcon, Check, ChevronDown } from 'lucide-react';
import { PlatformKey, PLATFORM_LABELS, platformIcon, platformColor } from '@/lib/platform';
import type { SourceFacet } from '@/lib/source';

const PLATFORM_ORDER: PlatformKey[] = ['youtube', 'x', 'instagram', 'linkedin', 'facebook', 'github'];

interface Group {
    id: string;
    label: string;
    icon: ReactNode;
    facets: SourceFacet[];
    count: number;
}

/** Brand/type icon for a single source facet (platform logo, globe, or image). */
function facetIcon(f: SourceFacet): ReactNode {
    if (f.platform) return <span style={{ color: platformColor(f.platform) }}>{platformIcon(f.platform, 'w-[18px] h-[18px]')}</span>;
    if (f.isScreenshot) return <ImageIcon className="w-[18px] h-[18px] text-text-secondary" />;
    return <Globe className="w-[18px] h-[18px] text-text-secondary" />;
}

/** Group the flat, ranked source facets by platform, with "Websites" and
    "Screenshots" buckets for the rest. A group with a single facet renders as a
    plain leaf row (no redundant one-child expander). */
function buildGroups(facets: SourceFacet[]): Group[] {
    const byPlatform = new Map<PlatformKey, SourceFacet[]>();
    const websites: SourceFacet[] = [];
    const screenshots: SourceFacet[] = [];
    for (const f of facets) {
        if (f.isScreenshot) screenshots.push(f);
        else if (f.platform) {
            const arr = byPlatform.get(f.platform) ?? [];
            arr.push(f);
            byPlatform.set(f.platform, arr);
        } else websites.push(f);
    }
    const sum = (fs: SourceFacet[]) => fs.reduce((n, f) => n + f.count, 0);
    const byRank = (a: SourceFacet, b: SourceFacet) => b.count - a.count || a.label.localeCompare(b.label);
    const groups: Group[] = [];
    for (const p of PLATFORM_ORDER) {
        const fs = byPlatform.get(p);
        if (!fs?.length) continue;
        groups.push({ id: `p:${p}`, label: PLATFORM_LABELS[p], icon: facetIcon(fs[0]), facets: fs.sort(byRank), count: sum(fs) });
    }
    if (websites.length) groups.push({ id: 'web', label: 'Websites', icon: <Globe className="w-[18px] h-[18px] text-text-secondary" />, facets: websites.sort(byRank), count: sum(websites) });
    if (screenshots.length) groups.push({ id: 'shot', label: 'Screenshots', icon: <ImageIcon className="w-[18px] h-[18px] text-text-secondary" />, facets: screenshots.sort(byRank), count: sum(screenshots) });
    return groups;
}

interface Props {
    facets: SourceFacet[];
    selected: Set<string>;
    onToggleKey: (key: string) => void;
    onToggleKeys: (keys: string[]) => void;
}

/**
 * Sources as a platform-grouped list: each platform (or Websites / Screenshots)
 * is a row that filters the whole group, expandable to the specific accounts /
 * publishers under it. Purely presentational over the existing `selectedSources`
 * facet state — selecting a group toggles all its facet keys at once.
 */
export default function SourceFacetList({ facets, selected, onToggleKey, onToggleKeys }: Props) {
    const groups = buildGroups(facets);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const toggleExpand = (id: string) =>
        setExpanded((cur) => {
            const next = new Set(cur);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });

    return (
        <div className="flex flex-col">
            {groups.map((g) => {
                // A one-facet NON-platform group (a lone website / screenshot) is
                // just that source — render it as a leaf, keeping the same structure
                // + a chevron-width spacer so it lines up with the expandable rows.
                // Platform groups (X, LinkedIn, Facebook, …) always render as the
                // platform parent with its account(s) nested beneath, even for a
                // single account, so LinkedIn reads as "LinkedIn ▸ <person>" like the
                // other platforms rather than surfacing the bare account name.
                if (g.facets.length === 1 && !g.id.startsWith('p:')) {
                    const f = g.facets[0];
                    const active = selected.has(f.key);
                    return (
                        <div key={g.id} className="flex items-center gap-1">
                            <button
                                onClick={() => onToggleKey(f.key)}
                                aria-pressed={active}
                                className={`flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-start transition-colors cursor-pointer ${active ? 'bg-accent/10 text-text' : 'text-text-secondary hover:bg-card-hover hover:text-text'}`}
                            >
                                <span className="shrink-0">{facetIcon(f)}</span>
                                <span className="flex-1 min-w-0 truncate font-medium">{f.label}</span>
                                <span className={`shrink-0 text-[12px] tabular-nums ${active ? 'text-accent font-semibold' : 'text-text-muted'}`}>{f.count}</span>
                                {active
                                    ? <Check className="w-[18px] h-[18px] shrink-0 text-accent" strokeWidth={2.6} />
                                    : <span className="w-[18px] h-[18px] shrink-0" />}
                            </button>
                            <span className="shrink-0 w-8" aria-hidden />
                        </div>
                    );
                }
                const keys = g.facets.map((f) => f.key);
                const selectedHere = g.facets.filter((f) => selected.has(f.key)).length;
                const allOn = selectedHere === g.facets.length;
                const isOpen = expanded.has(g.id);
                return (
                    <div key={g.id}>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => onToggleKeys(keys)}
                                aria-pressed={allOn}
                                className={`flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-start transition-colors cursor-pointer ${selectedHere > 0 ? 'bg-accent/10 text-text' : 'text-text-secondary hover:bg-card-hover hover:text-text'}`}
                            >
                                <span className="shrink-0">{g.icon}</span>
                                <span className="flex-1 min-w-0 truncate font-medium">{g.label}</span>
                                <span className={`shrink-0 text-[12px] tabular-nums ${selectedHere > 0 ? 'text-accent font-semibold' : 'text-text-muted'}`}>
                                    {selectedHere > 0 ? `${selectedHere}/${g.facets.length}` : g.count}
                                </span>
                                {/* A single clean check when the whole group is on; the
                                    accent count above already signals a partial selection. */}
                                {allOn
                                    ? <Check className="w-[18px] h-[18px] shrink-0 text-accent" strokeWidth={2.6} />
                                    : <span className="w-[18px] h-[18px] shrink-0" />}
                            </button>
                            <button
                                onClick={() => toggleExpand(g.id)}
                                aria-label={isOpen ? `Collapse ${g.label}` : `Expand ${g.label}`}
                                aria-expanded={isOpen}
                                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                            >
                                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                        {isOpen && (
                            <div className="flex flex-col">
                                {g.facets.map((f) => (
                                    <SourceRow key={f.key} indent label={f.label} count={f.count} active={selected.has(f.key)} onClick={() => onToggleKey(f.key)} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function SourceRow({ icon, label, count, active, onClick, indent }: { icon?: ReactNode; label: string; count: number; active: boolean; onClick: () => void; indent?: boolean }) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`flex items-center gap-2.5 py-2 rounded-xl text-[13px] text-start transition-colors ${indent ? 'ps-9 pe-2' : 'px-2'} ${active ? 'bg-accent/12 text-text' : 'text-text-secondary hover:bg-card-hover hover:text-text'}`}
        >
            {icon && <span className="shrink-0">{icon}</span>}
            <span className="flex-1 min-w-0 truncate font-medium">{label}</span>
            <span className="shrink-0 tabular-nums text-text-muted">{count}</span>
            {active && <Check className="w-4 h-4 shrink-0 text-accent" />}
        </button>
    );
}
