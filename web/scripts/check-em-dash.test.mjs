import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { scanTs, scanSwift } from './check-em-dash.mjs';

const lines = (hits) => hits.map((h) => h.line);

test('TSX: copy is caught in strings, templates, JSX text and entities', () => {
    const src = [
        "const a = 'Saved — now';",                 // 1 string
        'const b = `Hi ${name} — there`;',          // 2 template tail
        'const c = "\\u2014 escaped";',                  // 3 escape, decoded
        'const el = <p>Read this — now</p>;',       // 4 JSX text
        'const el2 = <p>Entity &mdash; here</p>;',       // 5 JSX entity
        "const ok = 'regex —'; // emdash-ok: parses", // 6 exempt
    ].join('\n');
    assert.deepEqual(lines(scanTs(ts, 'x.tsx', src)), [1, 2, 3, 4, 5]);
});

test('TSX: comments are not copy, and "image/*" does not open one', () => {
    const src = [
        '// a comment — fine',
        '/* block — fine */',
        '/**',
        ' * jsdoc — fine',
        ' */',
        'const input = <input accept="image/*" />;',
        "const after = 'still checked —';",         // 7: the old scanner skipped this
    ].join('\n');
    assert.deepEqual(lines(scanTs(ts, 'x.tsx', src)), [7]);
});

test('Swift: strings are checked, comments (nested too) are not', () => {
    const src = [
        'let a = "Saved — now"',                    // 1
        '// note — fine',
        '/* outer /* inner — */ still comment — */',
        'let url = "https://example.com/*"',
        'let b = "after —"',                        // 5
        'let c = """',
        'multi — line',                             // 7
        '"""',
    ].join('\n');
    assert.deepEqual(lines(scanSwift(src)), [1, 5, 7]);
});
