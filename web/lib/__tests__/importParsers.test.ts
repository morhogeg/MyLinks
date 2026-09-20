/**
 * Parser tests for lib/importParsers.ts. Run with `npm run test:parsers`.
 *
 * The repo has no JS test runner, and adding one (jest/vitest + its transform
 * chain) to ship three pure functions would be a worse trade than this: Node's
 * own `node:test` plus its type stripping, no dependencies, one script.
 *
 * The fixtures below are the real shapes, not idealised ones: Safari's export
 * with its unclosed tags, Chrome's with a nested folder and a bookmarklet,
 * Firefox's `place:` smart folder, and a Pocket CSV with quoted commas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseNetscapeBookmarks, parsePocketCsv, parseUrlList, parseCsvRows,
    parseImportFile, detectImportFormat, cleanImportUrl, parseImportDate,
    importDedupeKey, dedupeImported, recoverUrls,
} from '../importParsers.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const SAFARI_BOOKMARKS = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<Title>Bookmarks</Title>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 FOLDED>Favorites</H3>
    <DL><p>
        <DT><A HREF="https://www.nytimes.com/section/world" ADD_DATE="1600000000">World &amp; Nation</A>
        <DT><A HREF="https://news.ycombinator.com/">Hacker News</A>
    </DL><p>
    <DT><A HREF="https://example.com/top-level" ADD_DATE="1610000000">Top level</A>
</DL><p>`;

const CHROME_BOOKMARKS = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3 ADD_DATE="1590000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1591000000">Reading</H3>
        <DL><p>
            <DT><H3>Longform</H3>
            <DL><p>
                <DT><A HREF="https://longreads.com/a" ADD_DATE="1592000000">A long read</A>
            </DL><p>
            <DT><A HREF="https://example.org/b" ADD_DATE="1593000000">B</A>
        </DL><p>
        <DT><A HREF="javascript:(function(){alert(1)})()" ADD_DATE="1594000000">Bookmarklet</A>
        <DT><A HREF="https://after-the-folder.example/c">Back at the bar</A>
    </DL><p>
</DL><p>`;

const FIREFOX_BOOKMARKS = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="place:sort=8&amp;maxResults=10" ADD_DATE="1580000000">Recently Bookmarked</A>
    <DT><A HREF="https://developer.mozilla.org/en-US/" ADD_DATE="1581000000" TAGS="docs,web">MDN</A>
    <DT><HR>
    <DT><A HREF="chrome://browser/content/blanktab.html">Internal</A>
    <DT><A HREF="file:///Users/me/notes.html">Local notes</A>
</DL><p>`;

const POCKET_CSV = `url,title,time_added,tags,status
https://example.com/one,"Design, systems and other lies",1600000000,design|systems,unread
https://example.com/two,Plain title,1600100000,,archive
not-a-url,Broken row,1600200000,,unread
https://example.com/three,"He said ""hello""",1600300000,quotes,unread
`;

/* ------------------------------------------------------------------ *
 * Netscape bookmarks HTML
 * ------------------------------------------------------------------ */

test('safari export: reads every link, with folder as a tag hint', () => {
    const { links, skipped, format } = parseNetscapeBookmarks(SAFARI_BOOKMARKS);
    assert.equal(format, 'bookmarks');
    assert.equal(skipped, 0);
    assert.deepEqual(links.map((l) => l.url), [
        'https://www.nytimes.com/section/world',
        'https://news.ycombinator.com/',
        'https://example.com/top-level',
    ]);
    // Entities in the title are decoded, not left as &amp;.
    assert.equal(links[0].title, 'World & Nation');
    assert.deepEqual(links[0].tags, ['Favorites']);
    assert.equal(links[0].addedAt, 1_600_000_000_000);
    // A top-level bookmark sits in no folder, so it carries no tag hint.
    assert.equal(links[2].tags, undefined);
});

test('chrome export: nested folders become the full path, in order', () => {
    const { links } = parseNetscapeBookmarks(CHROME_BOOKMARKS);
    const byUrl = Object.fromEntries(links.map((l) => [l.url, l]));
    assert.deepEqual(byUrl['https://longreads.com/a'].tags,
        ['Bookmarks bar', 'Reading', 'Longform']);
    // Popping back out of a folder must not leave it on the path.
    assert.deepEqual(byUrl['https://example.org/b'].tags, ['Bookmarks bar', 'Reading']);
    assert.deepEqual(byUrl['https://after-the-folder.example/c'].tags, ['Bookmarks bar']);
});

test('bookmarklets and browser-internal entries are dropped and counted', () => {
    const chrome = parseNetscapeBookmarks(CHROME_BOOKMARKS);
    assert.equal(chrome.skipped, 1);
    assert.ok(!chrome.links.some((l) => l.url.startsWith('javascript:')));

    const firefox = parseNetscapeBookmarks(FIREFOX_BOOKMARKS);
    assert.deepEqual(firefox.links.map((l) => l.url), ['https://developer.mozilla.org/en-US/']);
    assert.equal(firefox.skipped, 3);   // place:, chrome://, file://
    assert.deepEqual(firefox.links[0].tags, ['docs', 'web']);
});

test('bookmarks parsing survives junk instead of throwing', () => {
    for (const junk of ['', '<DL>', '</DL></DL></DL>', 'plain text', '<A HREF=>x</A>',
        '<DT><A HREF="https://ok.example/">ok</A>']) {
        assert.doesNotThrow(() => parseNetscapeBookmarks(junk));
    }
    assert.equal(parseNetscapeBookmarks('<DT><A HREF=https://bare.example/>Bare</A>').links.length, 1);
});

/* ------------------------------------------------------------------ *
 * Pocket CSV
 * ------------------------------------------------------------------ */

test('csv rows: quoted commas, doubled quotes, trailing newline', () => {
    const rows = parseCsvRows('a,"b,c",d\n"say ""hi""",e,f\n');
    assert.deepEqual(rows, [['a', 'b,c', 'd'], ['say "hi"', 'e', 'f']]);
});

test('pocket export: columns found by name, tags split on the pipe', () => {
    const { links, skipped } = parsePocketCsv(POCKET_CSV);
    assert.equal(skipped, 1);   // the not-a-url row
    assert.deepEqual(links.map((l) => l.url), [
        'https://example.com/one', 'https://example.com/two', 'https://example.com/three',
    ]);
    assert.equal(links[0].title, 'Design, systems and other lies');
    assert.deepEqual(links[0].tags, ['design', 'systems']);
    assert.equal(links[0].addedAt, 1_600_000_000_000);
    assert.equal(links[1].tags, undefined);
    assert.equal(links[2].title, 'He said "hello"');
});

test('pocket export: a reordered header still maps correctly', () => {
    const { links } = parsePocketCsv('title,tags,url,time_added\nT,a|b,https://x.example/1,1600000000\n');
    assert.equal(links[0].url, 'https://x.example/1');
    assert.equal(links[0].title, 'T');
    assert.deepEqual(links[0].tags, ['a', 'b']);
});

test('pocket export: a headerless file is read positionally', () => {
    const { links } = parsePocketCsv('https://x.example/1,First,1600000000\nhttps://x.example/2,Second,1600000001\n');
    assert.deepEqual(links.map((l) => l.url), ['https://x.example/1', 'https://x.example/2']);
});

test('a csv with no url column anywhere yields nothing, not a crash', () => {
    // With no `url` header there is nothing to say row one is a header, so all
    // three rows are read as data and all three come back unusable.
    const { links, skipped } = parsePocketCsv('a,b\n1,2\n3,4\n');
    assert.equal(links.length, 0);
    assert.equal(skipped, 3);
});

/* ------------------------------------------------------------------ *
 * Plain text / pasted links
 * ------------------------------------------------------------------ */

test('url list: one per line, comments and blanks ignored', () => {
    const { links, skipped } = parseUrlList([
        'https://a.example/1',
        '',
        '# a comment',
        '   https://b.example/2   ',
        'nonsense',
        'See https://c.example/3 for more',
    ].join('\n'));
    assert.deepEqual(links.map((l) => l.url),
        ['https://a.example/1', 'https://b.example/2', 'https://c.example/3']);
    assert.equal(skipped, 1);
});

test('url list: a markdown link keeps its label as the title', () => {
    const { links } = parseUrlList('[The science of deep focus](https://nature.com/x)');
    assert.equal(links[0].url, 'https://nature.com/x');
    assert.equal(links[0].title, 'The science of deep focus');
});

test('url list: trailing prose punctuation is not part of the url', () => {
    assert.equal(parseUrlList('Read https://a.example/x.').links[0].url, 'https://a.example/x');
    assert.equal(parseUrlList('(https://a.example/y)').links[0].url, 'https://a.example/y');
});

/* ------------------------------------------------------------------ *
 * The gate, dates, dedupe, detection
 * ------------------------------------------------------------------ */

test('the url gate accepts http(s) only', () => {
    assert.equal(cleanImportUrl('https://a.example/x'), 'https://a.example/x');
    assert.equal(cleanImportUrl('  http://a.example/  '), 'http://a.example/');
    for (const bad of ['javascript:alert(1)', 'place:sort=8', 'chrome://x', 'file:///a',
        'ftp://a.example', 'data:text/html,x', 'https://', 'mailto:a@b.c', '', '   ', null, undefined]) {
        assert.equal(cleanImportUrl(bad as string), null, String(bad));
    }
    assert.equal(cleanImportUrl(`https://a.example/${'x'.repeat(3000)}`), null);
});

test('the url gate returns the url exactly as written', () => {
    // Not re-serialised: the library's duplicate check is an exact string match.
    assert.equal(cleanImportUrl('https://a.example'), 'https://a.example');
    assert.equal(cleanImportUrl('https://A.Example/Path?b=1'), 'https://A.Example/Path?b=1');
});

test('dates: seconds, milliseconds, microseconds, and junk', () => {
    assert.equal(parseImportDate('1600000000'), 1_600_000_000_000);
    assert.equal(parseImportDate(1_600_000_000_000), 1_600_000_000_000);
    assert.equal(parseImportDate(1_600_000_000_000_000), 1_600_000_000_000);
    for (const bad of ['', '0', 'yesterday', -1, undefined, null, 99_999_999_999_999_999]) {
        assert.equal(parseImportDate(bad as number), undefined, String(bad));
    }
    // A date in the future is a broken clock, not a bookmark.
    assert.equal(parseImportDate(Math.floor(Date.now() / 1000) + 86_400 * 30), undefined);
});

test('in-file duplicates collapse on host, path and query, not on the fragment', () => {
    assert.equal(importDedupeKey('https://A.Example/x/#section'), 'https://a.example/x');
    assert.equal(importDedupeKey('https://a.example/x?q=1'), 'https://a.example/x?q=1');
    const links = dedupeImported([
        { url: 'https://a.example/x', title: 'First' },
        { url: 'https://a.example/x/#top' },
        { url: 'https://a.example/y' },
    ]);
    assert.deepEqual(links.map((l) => l.url), ['https://a.example/x', 'https://a.example/y']);
    assert.equal(links[0].title, 'First');   // the first, richest entry wins
});

test('format detection reads the file, not just its name', () => {
    assert.equal(detectImportFormat(SAFARI_BOOKMARKS), 'bookmarks');
    assert.equal(detectImportFormat(POCKET_CSV), 'pocket');
    assert.equal(detectImportFormat('https://a.example/1\nhttps://a.example/2'), 'urls');
    assert.equal(detectImportFormat('<DL><p><DT><A HREF="https://a.example/">a</A>'), 'bookmarks');
    assert.equal(detectImportFormat('anything', 'export.html'), 'bookmarks');
    assert.equal(detectImportFormat('a,b\n1,2', 'ril_export.csv'), 'pocket');
});

test('parseImportFile picks the parser and de-duplicates', () => {
    const bookmarks = parseImportFile(SAFARI_BOOKMARKS, 'Safari Bookmarks.html');
    assert.equal(bookmarks.format, 'bookmarks');
    assert.equal(bookmarks.links.length, 3);

    const pocket = parseImportFile(POCKET_CSV, 'part_000000.csv');
    assert.equal(pocket.format, 'pocket');
    assert.equal(pocket.links.length, 3);

    const pasted = parseImportFile('https://a.example/1\nhttps://a.example/1/\nhttps://a.example/2');
    assert.equal(pasted.format, 'urls');
    assert.equal(pasted.links.length, 2);
});

test('an html file the bookmarks parser cannot read falls back to recovering urls', () => {
    const odd = '<html><body><p>https://a.example/1</p><p>https://a.example/2</p></body></html>';
    const result = parseImportFile(odd, 'saved.html');
    assert.equal(result.format, 'bookmarks');
    assert.deepEqual(result.links.map((l) => l.url), ['https://a.example/1', 'https://a.example/2']);
});

test('recoverUrls stops a url at a quote or an angle bracket', () => {
    const found = recoverUrls(`<a href="https://a.example/1">x</a> 'https://b.example/2'`);
    assert.deepEqual(found.map((l) => l.url), ['https://a.example/1', 'https://b.example/2']);
});

/* ------------------------------------------------------------------ *
 * Hostile inputs stay linear (2026-09-16 security round 2)
 * ------------------------------------------------------------------ */

function timed(label: string, fn: () => void, budgetMs = 1000) {
    const t = performance.now();
    fn();
    const took = performance.now() - t;
    assert.ok(took < budgetMs, `${label} took ${took.toFixed(0)} ms (budget ${budgetMs} ms)`);
}

test('an export of unclosed <a> tags does not go quadratic', () => {
    const html = '<a href="https://x.y/">'.repeat(20_000);
    timed('unclosed anchors', () => parseNetscapeBookmarks(html));
});

test('a giant attribute blob does not go quadratic', () => {
    const html = '<a ' + 'a'.repeat(80_000) + '></a>';
    timed('attribute blob', () => parseNetscapeBookmarks(html));
});

test('a URL with tens of thousands of trailing brackets is refused fast', () => {
    const html = '<a href="https://a.b/' + ')'.repeat(80_000) + 'x"></a>';
    timed('trailing brackets', () => parseNetscapeBookmarks(html));
    assert.equal(cleanImportUrl('https://a.b/' + ')'.repeat(80_000)), null);
});

test('ordinary bookmarks still parse after the bounds', () => {
    const out = parseNetscapeBookmarks(SAFARI_BOOKMARKS);
    assert.equal(out.links.length, 3);
    assert.equal(out.links[0].title, 'World & Nation');
    assert.deepEqual(out.links[0].tags, ['Favorites']);
});

/* ------------------------------------------------------------------ *
 * Raindrop / Instapaper CSV, ISO dates, Chrome JSON (2026-09-20)
 * ------------------------------------------------------------------ */

import { parseChromeBookmarksJson } from '../importParsers.ts';

const RAINDROP_CSV = `title,note,excerpt,url,folder,tags,created,cover,highlights,favorite
"A long read",,"An excerpt, with a comma",https://longreads.com/a,Reading / Longform,"design, systems",2023-04-05T10:11:12.000Z,,,false
Unsorted thing,,,https://example.com/u,Unsorted,,2024-01-02T00:00:00Z,,,false
`;

const INSTAPAPER_CSV = `URL,Title,Selection,Folder,Timestamp
https://example.com/one,One,,Unread,1600000000
https://example.com/two,Two,,Cooking,1600100000
`;

const CHROME_JSON = JSON.stringify({
    checksum: 'abc',
    roots: {
        bookmark_bar: {
            type: 'folder', name: 'Bookmarks bar', children: [
                { type: 'url', name: 'First', url: 'https://example.com/first', date_added: '13300000000000000' },
                {
                    type: 'folder', name: 'Reading', children: [
                        { type: 'folder', name: 'Longform', children: [
                            { type: 'url', name: 'Deep', url: 'https://longreads.com/deep', date_added: '13300000000000000' },
                        ] },
                        { type: 'url', name: 'Bookmarklet', url: 'javascript:void(0)' },
                    ],
                },
            ],
        },
        other: { type: 'folder', name: 'Other bookmarks', children: [
            { type: 'url', name: 'Other', url: 'https://example.org/other' },
        ] },
        synced: { type: 'folder', name: 'Mobile bookmarks', children: [] },
    },
    version: 1,
});

test('raindrop export: url found by name, folder AND tags become hints, ISO date read', () => {
    const { links, format } = parsePocketCsv(RAINDROP_CSV);
    assert.equal(format, 'pocket');
    assert.equal(links.length, 2);
    assert.equal(links[0].url, 'https://longreads.com/a');
    assert.equal(links[0].title, 'A long read');
    assert.deepEqual(links[0].tags, ['Reading', 'Longform', 'design', 'systems']);
    assert.equal(links[0].addedAt, Date.parse('2023-04-05T10:11:12.000Z'));
    // "Unsorted" is the absence of a folder, not a folder.
    assert.equal(links[1].tags, undefined);
});

test('instapaper export: capitalised header, Unread is not a folder, Cooking is', () => {
    const { links } = parseImportFile(INSTAPAPER_CSV, 'instapaper-export.csv');
    assert.equal(links.length, 2);
    assert.equal(links[0].tags, undefined);
    assert.deepEqual(links[1].tags, ['Cooking']);
});

test('iso dates parse; junk strings do not', () => {
    assert.equal(parseImportDate('2023-04-05'), Date.parse('2023-04-05'));
    assert.equal(parseImportDate('2023-04-05T10:11:12Z'), Date.parse('2023-04-05T10:11:12Z'));
    assert.equal(parseImportDate('yesterday'), undefined);
    assert.equal(parseImportDate('1999-13-45'), undefined);
});

test('chrome json: roots walked in order, root folders are not tags, webkit dates converted', () => {
    const { links, skipped, format } = parseChromeBookmarksJson(CHROME_JSON);
    assert.equal(format, 'chrome-json');
    assert.equal(skipped, 1);
    assert.deepEqual(links.map((l) => l.url), [
        'https://example.com/first',
        'https://longreads.com/deep',
        'https://example.org/other',
    ]);
    assert.equal(links[0].tags, undefined);
    assert.deepEqual(links[1].tags, ['Reading', 'Longform']);
    assert.equal(links[2].tags, undefined);
    // 13300000000000000 µs since 1601-01-01 = 2022-06-18T04:26:40Z
    assert.equal(links[0].addedAt, Date.parse('2022-06-18T04:26:40Z'));
});

test('chrome json is detected from the profile file with no extension, and from .json', () => {
    assert.equal(detectImportFormat(CHROME_JSON, 'Bookmarks'), 'chrome-json');
    assert.equal(detectImportFormat(CHROME_JSON, 'chrome.json'), 'chrome-json');
    assert.equal(parseImportFile(CHROME_JSON, 'Bookmarks').links.length, 3);
});

test('an unknown json shape still recovers its urls', () => {
    const odd = JSON.stringify({ items: [{ link: 'https://example.com/x' }, { link: 'https://example.com/y' }] });
    const { links } = parseImportFile(odd, 'export.json');
    assert.deepEqual(links.map((l) => l.url), ['https://example.com/x', 'https://example.com/y']);
});

test('chrome json: a malformed file yields nothing, not a crash', () => {
    assert.equal(parseChromeBookmarksJson('{"roots": 5').links.length, 0);
    assert.equal(parseChromeBookmarksJson('{"roots": {"bookmark_bar": null}}').links.length, 0);
    assert.equal(parseChromeBookmarksJson('[]').links.length, 0);
});
