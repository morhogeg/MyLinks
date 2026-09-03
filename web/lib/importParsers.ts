/**
 * Parsers for the three shapes a saved reading list actually arrives in.
 *
 * People do not start on Machina; they arrive carrying years of bookmarks. The
 * import sheet accepts what the tools they are leaving actually hand them:
 *
 *   - **Netscape bookmarks HTML** — what Safari, Chrome, Firefox, Edge, Arc and
 *     almost every "export bookmarks" button produce. Nested folders are kept as
 *     tag hints, so "Reading / Longform" survives the move as something the card
 *     can be filed by.
 *   - **Pocket CSV** — `url,title,time_added,tags,status`, the export Pocket
 *     users have been running since it shut down.
 *   - **Plain text** — one URL per line, which is also what "paste your links"
 *     produces.
 *
 * Everything here is pure and synchronous: no DOM, no fetch, no Firestore. That
 * is deliberate, so the rules are unit-testable (`lib/__tests__/importParsers.test.ts`,
 * `npm run test:parsers`) and so the same code runs in the iOS WebView, which
 * has no DOMParser guarantees worth relying on for a 30 MB bookmarks file.
 *
 * Robustness is the whole job. A real bookmarks file is full of things that are
 * not web pages: `javascript:` bookmarklets, `place:` smart folders,
 * `chrome://` internals, `file://` paths, empty separators, and mojibake. All of
 * it is dropped and counted, never thrown on. The backend
 * (`functions/main.py` `_import_url`) applies the same gate again, because a
 * client-side filter is a convenience, not a guarantee.
 */

/** One link recovered from an import file. */
export interface ImportedLink {
    url: string;
    /** The title the export carried, when it had one. */
    title?: string;
    /** The original save date in ms, when the export carried one. */
    addedAt?: number;
    /** Folder path and/or the export's own tags, as hints. Never authoritative. */
    tags?: string[];
}

export type ImportFormat = 'bookmarks' | 'pocket' | 'urls';

export interface ImportParseResult {
    format: ImportFormat;
    links: ImportedLink[];
    /** Entries that looked like content but carried no usable http(s) URL. */
    skipped: number;
}

/** Mirrors the backend's MAX_URL_LENGTH. Anything longer is truncated junk. */
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 300;
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 40;
/** Ceiling on one parse, so a pathological file can't hang the WebView. */
const MAX_PARSED_LINKS = 20_000;

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
};

/** Decode the handful of entities an exporter actually writes. */
function decodeEntities(text: string): string {
    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
        const key = body.toLowerCase();
        if (key.startsWith('#x')) {
            const code = parseInt(body.slice(2), 16);
            return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
        }
        if (key.startsWith('#')) {
            const code = parseInt(body.slice(1), 10);
            return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
        }
        return NAMED_ENTITIES[key] ?? whole;
    });
}

function cleanTitle(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const text = decodeEntities(raw).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, MAX_TITLE_LENGTH) : undefined;
}

/**
 * The one URL gate. http(s) only, a real host, under the length cap. Trailing
 * punctuation is stripped because a pasted list routinely ends a line with a
 * comma, a period, or a closing bracket that is prose, not part of the URL.
 *
 * The URL is returned exactly as the file wrote it (minus that punctuation), not
 * re-serialised through `URL`: the library's duplicate check is an exact match
 * on the stored `url` string, so silently rewriting one here would turn a link
 * the user already has into a second copy of it.
 */
export function cleanImportUrl(raw: string | undefined | null): string | null {
    if (typeof raw !== 'string') return null;
    const url = decodeEntities(raw).trim().replace(/[),.;'"\]>]+$/, '');
    if (!url || url.length > MAX_URL_LENGTH) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    try {
        if (!new URL(url).hostname) return null;
    } catch {
        return null;
    }
    return url;
}

function cleanTags(values: (string | undefined)[]): string[] | undefined {
    const out: string[] = [];
    for (const value of values) {
        const tag = decodeEntities(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
        if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
        if (out.length >= MAX_TAGS) break;
    }
    return out.length ? out : undefined;
}

/**
 * An export's date, in ms. Netscape `ADD_DATE` and Pocket `time_added` are both
 * unix seconds; a few tools write milliseconds or microseconds instead, so the
 * magnitude decides. Anything outside 1990 to now is treated as junk.
 */
export function parseImportDate(raw: string | number | undefined | null): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    let value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value) || value <= 0) return undefined;
    if (value > 1e14) value = Math.floor(value / 1000);   // microseconds
    else if (value < 1e11) value = value * 1000;           // seconds
    value = Math.floor(value);
    const now = Date.now();
    if (value < 631_152_000_000 || value > now + 86_400_000) return undefined;
    return value;
}

/**
 * The key two entries in the SAME file are considered the same link by: scheme
 * and host lowercased, no trailing slash, no fragment. Deliberately NOT used
 * against the library, where the comparison is the exact stored `url` string
 * (`findLinkIdByUrl`), so an in-file near-duplicate is collapsed while a real
 * saved card is always matched exactly.
 */
export function importDedupeKey(url: string): string {
    try {
        const u = new URL(url);
        const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '';
        return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}${u.search}`;
    } catch {
        return url.trim();
    }
}

/** Collapse repeats within one file, keeping the first (richest) occurrence. */
export function dedupeImported(links: ImportedLink[]): ImportedLink[] {
    const seen = new Set<string>();
    const out: ImportedLink[] = [];
    for (const link of links) {
        const key = importDedupeKey(link.url);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(link);
    }
    return out;
}

/* ------------------------------------------------------------------ *
 * Netscape bookmarks HTML (Safari / Chrome / Firefox / Edge / Arc)
 * ------------------------------------------------------------------ */

/** Attributes of one tag, lower-cased keys, quoted or bare values. */
function parseAttributes(source: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([a-z_][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
        attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    return attrs;
}

/**
 * Parse a Netscape bookmarks file.
 *
 * The format is a nesting of `<DL>` lists where a folder is an `<H3>` followed
 * by its own `<DL>`, so the folder path is just a stack pushed on `<DL>` and
 * popped on `</DL>`. Real files are not well-formed HTML (the `<DT>` and `<p>`
 * tags are unclosed), which is exactly why this scans tags with one regex
 * instead of asking a parser to build a tree.
 */
export function parseNetscapeBookmarks(html: string): ImportParseResult {
    const links: ImportedLink[] = [];
    let skipped = 0;
    const folders: string[] = [];
    let pendingFolder: string | null = null;

    const re = /<h3[^>]*>([\s\S]*?)<\/h3>|<a\s+([^>]*)>([\s\S]*?)<\/a>|<dl[^>]*>|<\/dl\s*>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null && links.length < MAX_PARSED_LINKS) {
        const token = match[0].toLowerCase();
        if (match[1] !== undefined) {
            pendingFolder = cleanTitle(match[1]) ?? null;
            continue;
        }
        if (match[2] !== undefined) {
            const attrs = parseAttributes(match[2]);
            const url = cleanImportUrl(attrs.href);
            if (!url) {
                // A bookmarklet, a browser-internal entry, or a broken row.
                skipped += 1;
                continue;
            }
            links.push({
                url,
                title: cleanTitle(match[3]) ?? cleanTitle(attrs.title),
                addedAt: parseImportDate(attrs.add_date),
                tags: cleanTags([...folders, ...(attrs.tags ? attrs.tags.split(',') : [])]),
            });
            continue;
        }
        if (token.startsWith('</dl')) {
            folders.pop();
            continue;
        }
        // An opening <DL>: it belongs to the folder whose <H3> we just saw. The
        // outermost one has no <H3>, which pushes an empty level that cleanTags
        // drops, so the root list never becomes a tag.
        folders.push(pendingFolder ?? '');
        pendingFolder = null;
    }

    return { format: 'bookmarks', links, skipped };
}

/* ------------------------------------------------------------------ *
 * Pocket CSV export
 * ------------------------------------------------------------------ */

/** RFC 4180 rows: quoted fields, doubled quotes, embedded newlines. */
export function parseCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    let started = false;

    const pushField = () => { row.push(field); field = ''; started = false; };
    const pushRow = () => {
        pushField();
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
    };

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"' && !started) { quoted = true; started = true; continue; }
        if (ch === ',') { pushField(); continue; }
        if (ch === '\r') continue;
        if (ch === '\n') { pushRow(); continue; }
        field += ch;
        started = true;
    }
    if (field !== '' || row.length) pushRow();
    return rows;
}

const POCKET_TAG_SEPARATORS = /[|,;]/;

/**
 * Parse a Pocket CSV export (`url,title,time_added,tags,status`).
 *
 * Columns are found by NAME, because the column order has changed across
 * Pocket's own export versions and other tools copy the format loosely. A file
 * with no recognisable header is still read positionally, on the one assumption
 * every variant shares: the URL is the first column that holds a URL.
 */
export function parsePocketCsv(csv: string): ImportParseResult {
    const rows = parseCsvRows(csv);
    if (!rows.length) return { format: 'pocket', links: [], skipped: 0 };

    const header = rows[0].map((c) => c.trim().toLowerCase());
    const hasHeader = header.some((c) => c === 'url') && !cleanImportUrl(rows[0][header.indexOf('url')]);
    const indexOf = (...names: string[]) => {
        for (const name of names) {
            const at = header.indexOf(name);
            if (at !== -1) return at;
        }
        return -1;
    };

    let urlAt = hasHeader ? indexOf('url', 'uri', 'link') : -1;
    const titleAt = hasHeader ? indexOf('title', 'name', 'resolved_title') : -1;
    const dateAt = hasHeader ? indexOf('time_added', 'timeadded', 'created_at', 'date') : -1;
    const tagsAt = hasHeader ? indexOf('tags', 'folder') : -1;

    const body = hasHeader ? rows.slice(1) : rows;
    if (urlAt === -1) {
        // Headerless (or an unrecognised header): find the URL column from the
        // first row that has one, then read every row the same way.
        for (const row of body) {
            const at = row.findIndex((cell) => cleanImportUrl(cell) !== null);
            if (at !== -1) { urlAt = at; break; }
        }
    }
    if (urlAt === -1) return { format: 'pocket', links: [], skipped: body.length };

    const links: ImportedLink[] = [];
    let skipped = 0;
    for (const row of body) {
        if (links.length >= MAX_PARSED_LINKS) break;
        if (row.every((cell) => cell.trim() === '')) continue;
        const url = cleanImportUrl(row[urlAt]);
        if (!url) { skipped += 1; continue; }
        const rawTags = tagsAt !== -1 ? (row[tagsAt] ?? '') : '';
        links.push({
            url,
            title: cleanTitle(titleAt !== -1 ? row[titleAt] : undefined),
            addedAt: parseImportDate(dateAt !== -1 ? row[dateAt] : undefined),
            tags: cleanTags(rawTags ? rawTags.split(POCKET_TAG_SEPARATORS) : []),
        });
    }
    return { format: 'pocket', links, skipped };
}

/* ------------------------------------------------------------------ *
 * Plain text: one URL per line (also covers "paste your links")
 * ------------------------------------------------------------------ */

/** A URL runs until whitespace or a delimiter that cannot be inside one. */
const URL_PATTERN = /https?:\/\/[^\s<>"'`\\]+/i;

/**
 * Read one URL per line. A markdown link keeps its label as the title, since
 * "paste your links" often means pasting a list someone already wrote out.
 * Blank lines and `#` comments are ignored rather than counted as failures.
 */
export function parseUrlList(text: string): ImportParseResult {
    const links: ImportedLink[] = [];
    let skipped = 0;
    for (const rawLine of text.split(/\r?\n/)) {
        if (links.length >= MAX_PARSED_LINKS) break;
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const markdown = /^\[([^\]]*)\]\(\s*(\S+?)\s*\)$/.exec(line);
        const found = markdown ? markdown[2] : URL_PATTERN.exec(line)?.[0];
        const url = cleanImportUrl(found);
        if (!url) { skipped += 1; continue; }
        links.push({ url, title: markdown ? cleanTitle(markdown[1]) : undefined });
    }
    return { format: 'urls', links, skipped };
}

/**
 * Last resort: pull every http(s) URL out of a file, wherever it sits.
 *
 * Used only when a detected format yields nothing, which is what an HTML or CSV
 * variant this does not know looks like. It loses titles, dates and folders, but
 * a user who exported something unusual gets their links rather than an error,
 * and that trade is the right one for the one screen standing between them and a
 * library that is not empty.
 */
export function recoverUrls(text: string): ImportedLink[] {
    const links: ImportedLink[] = [];
    const re = new RegExp(URL_PATTERN.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null && links.length < MAX_PARSED_LINKS) {
        const url = cleanImportUrl(match[0]);
        if (url) links.push({ url });
    }
    return links;
}

/* ------------------------------------------------------------------ *
 * Format detection + the one entry point
 * ------------------------------------------------------------------ */

/** Which parser a file wants, from its name and its first bytes. */
export function detectImportFormat(text: string, filename?: string): ImportFormat {
    const name = (filename ?? '').toLowerCase();
    const head = text.slice(0, 4096).toLowerCase();
    if (head.includes('netscape-bookmark-file') || /<dt>\s*<a\s+href/i.test(head)) return 'bookmarks';
    if (/\.html?$/.test(name)) return 'bookmarks';
    const firstLine = (text.split(/\r?\n/, 1)[0] ?? '').toLowerCase();
    if (firstLine.includes(',') && /(^|,)\s*"?url"?\s*(,|$)/.test(firstLine)) return 'pocket';
    if (/\.(csv|tsv)$/.test(name)) return 'pocket';
    return 'urls';
}

/**
 * Parse whatever the user handed us, de-duplicated, in file order.
 *
 * The format is detected rather than asked for: nobody should have to know
 * whether their export is "Netscape HTML". A file that detects as one format
 * but yields nothing falls back to the plain-text reader, which recovers the
 * links from an HTML or CSV variant this does not otherwise know.
 */
export function parseImportFile(text: string, filename?: string): ImportParseResult {
    const format = detectImportFormat(text, filename);
    let result = format === 'bookmarks' ? parseNetscapeBookmarks(text)
        : format === 'pocket' ? parsePocketCsv(text)
            : parseUrlList(text);
    if (!result.links.length && format !== 'urls') {
        const recovered = recoverUrls(text);
        if (recovered.length) result = { format, links: recovered, skipped: 0 };
    }
    return { ...result, links: dedupeImported(result.links) };
}
