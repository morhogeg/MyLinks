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
// Wired as `prebuild` in web/package.json, so it runs on every `npm run
// build`: Vercel deploys and the iOS → TestFlight workflow both refuse to
// ship a violation instead of letting the owner find it on device.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [
    join(webRoot, 'components'),
    join(webRoot, 'app'),
    join(webRoot, 'lib'),
    join(webRoot, 'ios', 'App', 'ShareExt'),
];

const files = [];
function walk(dir) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) {
            if (name === 'node_modules' || name === '.next' || name === 'out') continue;
            walk(p);
        } else if (/\.(tsx?|swift)$/.test(name)) {
            files.push(p);
        }
    }
}
roots.forEach((r) => { try { walk(r); } catch { /* root may not exist in some checkouts */ } });

const violations = [];
for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    let inBlock = false;
    lines.forEach((raw, i) => {
        if (raw.includes('emdash-ok')) return;
        let l = raw;
        if (inBlock) {
            const end = l.indexOf('*/');
            if (end === -1) return;
            l = l.slice(end + 2);
            inBlock = false;
        }
        let open;
        while ((open = l.indexOf('/*')) !== -1) {
            const close = l.indexOf('*/', open + 2);
            if (close === -1) { l = l.slice(0, open); inBlock = true; break; }
            l = l.slice(0, open) + l.slice(close + 2);
        }
        // JSDoc/continuation comment lines.
        if (/^\s*\*/.test(raw)) return;
        // Line comments. (Heuristic: a // preceded by http(s): is a URL, keep.)
        const slash = l.indexOf('//');
        if (slash !== -1 && !/https?:$/.test(l.slice(0, slash).trimEnd().slice(-6))) l = l.slice(0, slash);
        if (l.includes('—')) violations.push(`${f.replace(webRoot + '/', 'web/')}:${i + 1}: ${raw.trim().slice(0, 140)}`);
    });
}

if (violations.length) {
    console.error('\nEM DASH BAN (SOURCE_OF_TRUTH 11a3): em dashes are not allowed in user-facing');
    console.error('text. Use a period, colon, comma, or parentheses. For a legitimate non-copy');
    console.error('use, add an `emdash-ok` comment on the line with a reason.\n');
    for (const v of violations) console.error('  ' + v);
    console.error(`\n${violations.length} violation(s). Build refused.\n`);
    process.exit(1);
}
console.log('em dash check: clean');
