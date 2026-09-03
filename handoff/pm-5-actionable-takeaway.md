# PM-5 — "Show the value you already generate" (actionable takeaway)

Branch: `claude/pm-5-actionable-takeaway`. Nothing merged, nothing deployed.

The analysis has been producing `actionableTakeaway` for a long time and no
surface ever rendered it. This branch makes it visible in the card detail view,
fixes the one save path that dropped it, fixes the Ask retrieval read that could
never find it, and adds it to the Markdown data export.

---

## 1. Where the field actually lives (the audit)

**Canonical stored location: `metadata.actionableTakeaway`.** Every backend save
path funnels through the single builder `functions/main.py _build_link_data`
(line 1180), which always writes `metadata.actionableTakeaway`
(`analysis.get("actionableTakeaway")`, i.e. `None` when the model omitted it).

Audited, all VERIFIED by reading the code and by the new tests:

| Save path | Route | Takeaway persisted |
| --- | --- | --- |
| `analyze_link` (web plus button, link) | `_build_link_data` (main.py:1716) | yes |
| `analyze_link` note branch (`text`) | `_note_link_data` (main.py:1624) | yes |
| `analyze_image` (single image) | `_build_link_data` (main.py:2494) | yes |
| `share_ingest` link path | writes a pending doc, then the background trigger | yes |
| `share_ingest` shared TEXT (verbatim) | `_note_link_data(verbatim=True)` (main.py:2814) | yes |
| `process_link_background` (share, web enqueue, multi-image queue, YouTube) | `_build_link_data` (main.py:3995) | yes |
| Web retry (`retryFailedLink`) | `web/lib/storage.ts:530` | yes, already |
| Web image save (`AddLinkForm`) | `web/components/AddLinkForm.tsx:767` | yes, already |
| **Web Note tab (`createNoteCard` + `enrichNoteCard`)** | client-side | **NO — fixed here** |

`_apply_youtube_metadata` and `_apply_post_thumbnail` mutate `link_data["metadata"]`
key by key after the builder runs, so a video / social-post card keeps its
takeaway. Both are now pinned by tests.

**A top-level `actionableTakeaway` on a card doc does not exist today.** No write
path produces one. It exists only on the *slimmed* card dict Ask builds for the
prompt (`main.py` ~2161, `ai_service.py:507`) and in the fixtures that mirror it.
Per the brief both readers accept both shapes and **prefer top-level**, and no
old document is migrated.

### The one dropped path (fixed)

`web/lib/storage.ts enrichNoteCard`. A note typed in the Note tab is written
client-side by `createNoteCard`, then enriched in the background from
`/api/analyze`'s note branch. That enrichment copied tags, category, concepts,
related links and the AI title across but never the takeaway, so a note carrying
a genuine action never had one stored.

Fix at `web/lib/storage.ts:368-371`: the patch now carries
`'metadata.actionableTakeaway'`, **set-or-clear** (`deleteField()` when the fresh
analysis has none). Clear, not just set, because `enrichNoteCard` also runs on
the note-EDIT path (`useLinkActions.handleUpdateNote`, `titleOnly: true`): the
note's words changed, so a takeaway derived from the old words must not survive
as if it described the new ones. Unlike tags and category, the takeaway is not a
filing choice the user curates, so refreshing it on an edit is correct.

Side effect, judged acceptable: a note edit now always issues this one small
field update, where before the patch was often empty and no write happened. The
`sync_link_embedding` trigger no-ops on it unless the card actually needs
re-embedding.

### The Ask read that could never work (fixed)

`ask_brain`'s card slimmer read `c.get("actionableTakeaway")` — top level — off a
**raw Firestore card doc** (`normalize_card_for_search` does not flatten
`metadata`). Nothing writes that key, so the lookup returned `""` for every card
and **no takeaway had ever reached the Ask prompt**, despite the surrounding
comment describing it as part of the deep-content window.

Fix: new pure helper `functions/main.py _card_takeaway` (line 1324), called at
line 2161. It reads both shapes, prefers top-level, trims, and treats blank or
non-string as absent. This is a fix to a latent bug, not a behavior change to
anything that worked: no ask loses a takeaway it used to get.

### Two identical bugs I did NOT fix (out of PM-5 scope, flagging for the supervisor)

Same block, same defect, same one-line shape. I left them alone rather than
widen the item, but they are real:

- `functions/main.py:2175` — `_cap_list(c.get("videoHighlights"), 8, 200)`.
  `_apply_youtube_metadata` writes `metadata.videoHighlights`, so Ask never sees
  a video's highlights.
- `functions/main.py:2178` — `_cap_list(c.get("speakers"), 6, 80)`. Same;
  written to `metadata.speakers`.
- `functions/search.py:105` — `build_embedding_text` reads
  `data.get("videoHighlights")` top level. Fine for the fresh-analysis caller
  (`_embedding_text_from_analysis` builds a synthetic top-level dict) but empty
  for the Firestore-trigger and backfill callers, which pass a raw card doc.
- `functions/tools/ask_debug.py:60` mirrors the old top-level-only takeaway read.
  It is a frozen one-off debug harness from a past incident, so I left it.

---

## 2. What I built

### `web/lib/takeaway.ts` (new)

`getActionableTakeaway(link)` — the one reader. Accepts a `Link` or a raw
Firestore doc, prefers the top-level key, falls back to
`metadata.actionableTakeaway`, trims, and returns `''` when there is none (a
whitespace-only value counts as absent). Deliberately returns a string so every
caller's emptiness check is the same one.

I did **not** add a top-level `actionableTakeaway` to the `Link` interface in
`web/lib/types.ts`. Leaving it off keeps that shared file untouched and makes
`link.actionableTakeaway` a type error, which pushes callers to the helper.

### The render — `web/components/LinkDetailModal.tsx`, lines 1169-1202

**Exact insertion point on this branch:** immediately after the detailed-summary
block closes (`</div>` + `)}` at 1166-1167) and immediately before the
`{/* MACHINA'S READ …*/}` comment at 1204. One self-contained IIFE block, the
same idiom the file already uses at 1064. Nothing else in the file changed
except two imports: `CircleCheck` added to the `lucide-react` line (6) and
`getActionableTakeaway` (24).

```tsx
{(() => {
    const takeaway = getActionableTakeaway(link);
    const isAnswerCard = String(link.captureType) === 'answer';
    if (!takeaway || isAnswerCard) return null;
    return (
        <div className="mb-6" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className={`flex items-center gap-2 mb-2 text-sm font-bold text-text-muted ${isRtl ? '' : 'uppercase tracking-wider'}`}>
                <CircleCheck className="w-4 h-4 shrink-0 text-accent" />
                <span>{isRtl ? 'לעשות' : 'Do this'}</span>
            </div>
            <p className={`reading-prose text-text-secondary leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
                {takeaway}
            </p>
        </div>
    );
})()}
```

Design notes:

- **Copy.** English `Do this`. Hebrew `לעשות` — the infinitive, because every
  Hebrew imperative is gendered and this label must not be. No em dashes.
- **Quiet, not a callout.** No box, no fill, no border. The label uses the exact
  treatment of the "Machina's read" header directly below it (`text-sm font-bold
  text-text-muted`, 16px accent glyph, `gap-2`), so the two read as sibling
  sections rather than two unrelated inventions. The body line carries
  `reading-prose`, the same class the summary lead uses, so it matches the
  summary's type scale AND honours the reader's iOS Dynamic Type preference.
- **Direction.** `dir` on the wrapper, so in Hebrew the glyph leads on the right
  without a `flex-row-reverse` hack. Hebrew drops `uppercase` (a no-op) and
  `tracking-wider` (which only makes Hebrew look loose).
- **Never rendered** when the field is missing, blank, or whitespace.
- **Never rendered for answer cards.** `String(link.captureType) === 'answer'`
  compares as a plain string on purpose: PM-3 is adding `'answer'` to the union,
  and this guard compiles and holds either way.
- **The card face is untouched.** No change to `Card`, `ListCard`, or any feed
  surface.

### Data export — `web/components/settings/DataExport.tsx:117-124`

The Markdown export already shipped the summary; it now emits
`**Do this:** <takeaway>` after it, when there is one. English label, since the
whole export file is English chrome (`URL:`, `Category:`, `Saved:`). The JSON
export is a full-fidelity dump of the raw docs and already contained the field.

### Backend

- `functions/main.py:1324` — new `_card_takeaway` helper.
- `functions/main.py:2161` — `ask_brain`'s slimmer uses it.
- `functions/tests/test_actionable_takeaway.py` (new, 14 tests) — pins the write
  paths (link, image, note, verbatim text, absent-is-`None`), pins that the
  YouTube and post-thumbnail metadata appliers do not clobber it, pins that the
  embedding recipe still folds it in, and covers `_card_takeaway` including the
  stored-metadata shape, top-level preference, trimming, and malformed cards.

---

## 3. Verified vs NOT verified

**Verified in this session:**

- `cd web && npx tsc --noEmit` — exit 0.
- `node web/scripts/check-em-dash.mjs` — clean.
- `npx eslint` on the four touched web files — 0 errors. One pre-existing warning
  in `LinkDetailModal.tsx` (`isYouTube` assigned but never used); confirmed by
  stashing that it is on `main` already and is not mine.
- `cd functions && venv/bin/python -m py_compile *.py` — clean.
- `pytest tests` — **722 passed**, up from the 708 on `main` (14 new tests, same
  offline venv, no network).
- Render check with Chromium at 390px, light and dark, LTR and RTL. Screenshots
  in `handoff/pm-5/`. Built by compiling the REAL `web/app/globals.css` through
  the project's own `@tailwindcss/postcss`, so the tokens, `reading-prose` and
  every utility are the app's actual CSS, not hand-written approximations. The
  scratch files were deleted; the block markup in them is copied verbatim from
  the JSX.

**NOT verified:**

- Anything on a device or in the signed-in app. I cannot sign in.
- `npm run build` does not complete in this session: the static export step dies
  at `/_not-found` with `FirebaseError: auth/invalid-api-key` because the session
  has no Firebase env vars. **Confirmed identical on unmodified `main`** by
  stashing. Compilation and the TypeScript pass both succeed.
- The Firestore rules emulator suite (no rules changed here).
- The `enrichNoteCard` fix end to end, i.e. an actual note whose analysis returns
  a takeaway. The logic is covered by reading, not by a test: there is no web
  test harness in this repo.
- That Gemini in fact returns a takeaway often enough for this block to be seen
  regularly. The prompt makes it optional by design.

---

## 4. Shared-file edits other sessions must know about

- **`web/components/LinkDetailModal.tsx`** — ONE new block at 1169-1202, plus
  `CircleCheck` on the lucide import line 6 and a new import line 24. PM-1's
  partial-capture line under the summary lead and mark-read effect, and PM-3's
  "Based on" row, do not overlap it. The likely conflict is the shared lucide
  import line if another session also adds an icon there.
- **`functions/main.py`** — two surgical edits: a new helper after
  `_card_source_name` (1324), and one line inside `ask_brain`'s slimmer (2161).
- **`web/lib/storage.ts`** — one block inside `enrichNoteCard` (368-371) plus its
  doc comment.
- **`web/components/settings/DataExport.tsx`** — one block in `buildMarkdown`
  plus one import.
- **`web/lib/types.ts` — NOT touched.** PM-3 owns adding `'answer'` to
  `captureType`; my guard is a string compare and needs no type change.
- New files, no conflict: `web/lib/takeaway.ts`,
  `functions/tests/test_actionable_takeaway.py`, `handoff/`.

**Deploy note for whoever ships this:** `functions/main.py` changed, so the
merge needs a `Deploy-Functions:` line covering `ask_brain` (the only function
whose behavior changes). Nothing else backend-side moved.
