// Build gate: no em dashes in user-facing text (SOURCE_OF_TRUTH §4 11a3).
//
// Owner rule, re-violated enough times to earn a tripwire: em dashes read as
// AI-written copy and are banned from every string a user can see. This scans
// the web source (and the ShareExt Swift) and FAILS the build on any em dash
// found OUTSIDE a comment. Code comments are allowed — they are not shipped.
//
// A legitimate non-copy use (e.g. a regex that PARSES em dashes out of
// existing data) is exempted by putting `emdash-ok` in a comment on the same
// line, with a reason.
//
// TypeScript/TSX is read through the TypeScript parser: only string literals,
// template text and JSX text are checked, with escapes decoded (`—`) and
// JSX entities (`&mdash;`, `&#8212;`, `&#x2014;`) caught. The old line scanner
// took the `/*` in `accept="image/*"` for a comment and skipped real code
// after it (launch audit C-5). Swift goes through a small comment-aware
// scanner that knows string literals and nested block comments.
//
// Wired as `prebuild` in web/package.json, so it runs on every `npm run
// build`: Vercel deploys and the iOS → TestFlight workflow both refuse to
// ship a violation instead of letting the owner find it on device.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const EM = '—';
const ENTITY = /&(?:mdash|#8212|#x2014);/i;

/** Em dashes a user could see in a TS/TSX source: [{ line, text }]. */
export function scanTs(ts, fileName, text) {
    const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true,
        fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lines = text.split('\n');
    const hits = [];
    const report = (node, value) => {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
        const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
        for (let l = line; l <= endLine; l++) if (lines[l]?.includes('emdash-ok')) return;
        hits.push({ line: line + 1, text: value.trim().slice(0, 140) });
    };
    const visit = (node) => {
        switch (node.kind) {
            case ts.SyntaxKind.StringLiteral:
            case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            case ts.SyntaxKind.TemplateHead:
            case ts.SyntaxKind.TemplateMiddle:
            case ts.SyntaxKind.TemplateTail:
                if (node.text.includes(EM)) report(node, node.text);
                break;
            case ts.SyntaxKind.JsxText: {
                const raw = node.getText(sf);
                if (raw.includes(EM) || ENTITY.test(raw)) report(node, raw);
                break;
            }
            default:
                break;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return hits;
}

/** Em dashes outside comments in Swift source: [{ line, text }]. */
export function scanSwift(text) {
    const lines = text.split('\n');
    const hits = new Set();
    let i = 0;
    let line = 0;
    let blockDepth = 0;
    let inString = false;
    let multiline = false;
    while (i < text.length) {
        const c = text[i];
        if (c === '\n') { line++; i++; if (inString && !multiline) inString = false; continue; }
        if (blockDepth > 0) {
            if (text.startsWith('/*', i)) { blockDepth++; i += 2; continue; }
            if (text.startsWith('*/', i)) { blockDepth--; i += 2; continue; }
            i++;
            continue;
        }
        if (inString) {
            if (c === '\\') { i += 2; continue; }
            if (multiline && text.startsWith('"""', i)) { inString = false; multiline = false; i += 3; continue; }
            if (!multiline && c === '"') { inString = false; i++; continue; }
            if (c === EM && !lines[line].includes('emdash-ok')) hits.add(line);
            i++;
            continue;
        }
        if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i++; continue; }
        if (text.startsWith('/*', i)) { blockDepth = 1; i += 2; continue; }
        if (text.startsWith('"""', i)) { inString = true; multiline = true; i += 3; continue; }
        if (c === '"') { inString = true; i++; continue; }
        if (c === EM && !lines[line].includes('emdash-ok')) hits.add(line);
        i++;
    }
    return [...hits].sort((a, b) => a - b).map((l) => ({ line: l + 1, text: lines[l].trim().slice(0, 140) }));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    const roots = [
        join(webRoot, 'components'),
        join(webRoot, 'app'),
        join(webRoot, 'lib'),
        join(webRoot, 'ios', 'App', 'ShareExt'),
    ];
    const files = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            const st = statSync(p);
            if (st.isDirectory()) {
                if (name === 'node_modules' || name === '.next' || name === 'out' || name === '__tests__') continue;
                walk(p);
            } else if (/\.(tsx?|swift)$/.test(name)) {
                files.push(p);
            }
        }
    };
    roots.forEach((r) => { try { walk(r); } catch { /* root may not exist in some checkouts */ } });

    const ts = (await import('typescript')).default;
    const violations = [];
    for (const f of files) {
        const text = readFileSync(f, 'utf8');
        const hits = f.endsWith('.swift') ? scanSwift(text) : scanTs(ts, f, text);
        for (const h of hits) violations.push(`${f.replace(webRoot + '/', 'web/')}:${h.line}: ${h.text}`);
    }

    if (violations.length) {
        console.error('\nEM DASH BAN (SOURCE_OF_TRUTH 11a3): em dashes are not allowed in user-facing');
        console.error('text. Use a period, colon, comma, or parentheses. For a legitimate non-copy');
        console.error('use, add an `emdash-ok` comment on the line with a reason.\n');
        for (const v of violations) console.error('  ' + v);
        console.error(`\n${violations.length} violation(s). Build refused.\n`);
        process.exit(1);
    }
    console.log(`em dash check: clean (${files.length} files)`);
}
