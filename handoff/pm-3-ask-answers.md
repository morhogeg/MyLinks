# PM-3 — "Ask answers become things"

Branch `claude/pm-3-ask-answers`. Origin: SOURCE_OF_TRUTH §4 item 20 (M19
Shareable cited answers). Nothing deployed, nothing merged, no PR.

Before this, a finished Ask answer offered exactly one affordance: Copy. You
could not keep an answer and you could not show one to anyone. Both halves are
now built.

---

## A. Save an answer as a card

Under every settled assistant answer, next to Copy: **Save** (bookmark glyph).
It writes a normal card into `users/{uid}/links` with `captureType: 'answer'`.

**What the card carries** (`web/lib/answerCards.ts` → `buildAnswerCard`):

| field | value |
| --- | --- |
| `title` | the question, untruncated |
| `summary` | the answer's first paragraph |
| `detailedSummary` | the full answer markdown |
| `language` | `he` / `en` via `hasHebrew` over the answer and the question |
| `category` | the cited cards' most common category, canonicalised first, else `General` |
| `tags` / `concepts` | frequency-ranked union of the cited cards' own, capped at 6 / 8 |
| `answerSources` | `[{ id, title, url? }]` per cited card |
| `relatedLinks` | one entry per cited card still in the library, reason `Cited in this answer` / `צוטט בתשובה הזו`, `similarity: 0.9` |
| `sourceType` / `sourceName` / `captureType` | `answer` / `Machina answer` / `answer` |
| `needsEmbedding` | `true` |
| `answerRef` | `"<chatId>:<messageIndex>"` |

The stored answer text is `breakIntoParagraphs(normalizeListMarkers(answer))` —
the same two deterministic, text-preserving repairs the chat renders with, so
the card reads exactly like the answer that was kept. Both now live in
`web/lib/answerLayout.ts`; `normalizeListMarkers` **moved there out of
`AskBrain.tsx`** so the chat and the save path share one implementation.

`similarity: 0.9` is above `STRONG` (0.85) in `lib/related.ts` on purpose: a
citation is a deliberate tie, not an inferred one, so it earns the "strong"
badge and a full-weight graph edge. No Gemini call anywhere in this path.

**Idempotency.** `answerRef` keys the card. Save queries the loaded feed first,
then `where('answerRef','==',ref) limit 1`; a hit opens that card instead of
writing a second one, and the button reads "Saved" and opens the card from then
on. The message also stores `savedCardId`, which rides the chat doc, so the
state survives reopening the conversation on any device.
*Known narrow gap:* if an answer is saved before its chat doc exists,
`answerRef` falls back to a djb2 hash of question+answer. The `savedCardId` on
the message still prevents a duplicate; only losing that field would allow one.
In practice the chat doc is created on send, before any answer completes.

**Toast.** "Saved as a card" with an **Open** action. There was no
toast-with-action pattern in the repo, so `components/Toast.tsx` gained an
optional third state: `toast.success(msg, { label, onClick })`. Additive and
backward compatible; every existing call site is unchanged.

**Embedding.** `sync_link_embedding` gates on card STATE (skips `processing` /
`failed` / already-vectorized), never on type, so it embeds an answer card with
no change. `functions/tests/test_answer_card_embedding.py` pins that, so a
future type filter cannot silently strip kept answers out of search and Ask.

**Ungrounded answers** can be saved; the card carries no `answerSources` and no
`relatedLinks`, because a card must never imply proof the answer did not have.

---

## B. Share an answer as a cited public page

**Share** next to Save opens `components/ShareAnswerSheet.tsx`, modelled on
`ShareCollectionSheet.tsx`: a preview of what goes public, Create share link,
copy, native share via `@capacitor/share` (through `lib/share.ts`), View page,
Stop sharing.

**Privacy, enforced twice.**

1. *Client, on the way in* (`web/lib/answerShare.ts` →
   `resolveShareableSources`): every cited card is resolved against the loaded
   feed, then by `getDoc` for anything outside that window, then checked against
   the privacy vault (`isPrivate` on the card, or membership in a private
   collection). A vaulted card is dropped. A card that cannot be resolved at all
   is also dropped — we cannot prove it is not private. Sources link to the
   ORIGINAL public URL only; a note, a screenshot or another kept answer is
   listed by title alone. **No card ids ever enter the snapshot.**
2. *Server, on the way out* (`functions/share_service.py` →
   `_sanitize_answer_payload`): the answer snapshot is REBUILT from an
   allowlist of `question`, `answer`, `sources[{title,url?}]`, `ungrounded`, with
   lengths and counts capped. An id, a thumbnail, an `ownerUid` or anything else
   a future client posts cannot reach a world-readable doc.

If every cited card is private the sheet refuses and publishes nothing. If only
some are, it publishes and says so.

**Server render.** `/a?id=` is served by the existing `share_page` function
(`functions/main.py`), which now dispatches three routes instead of two.
`_render_shared_answer` uses the same shell, type scale and footer as the card
page: an "Answer" kicker, the question as `h1`, the answer through the existing
`_md_to_html`, a Sources list, the ungrounded notice when flagged, the credit
line, and the existing Open-in-Machina button. OG image is the 512px brand icon
with declared width/height/type — 125 KB, well inside the WhatsApp budget, using
the existing `_og_image_meta` path. No new renderer was written;
`_generate_og_preview` returns early for answers so the SSRF-guarded fetch never
runs for a page that has no image.

---

## Exact files

**New**
- `web/lib/answerCards.ts` — build and save an answer card, idempotently.
- `web/lib/answerShare.ts` — vault filtering, publish, unpublish.
- `web/components/ShareAnswerSheet.tsx` — the share sheet.
- `functions/tests/test_share_answer_page.py` — 24 tests (render + privacy).
- `functions/tests/test_answer_card_embedding.py` — 4 tests.
- `handoff/pm-3-ask-answers.md` — this file.

**Owned, edited freely**
- `web/components/AskBrain.tsx` — Save/Share row under settled answers,
  `saveAnswer`, `patchMessageAt`, `questionFor`, the sheet mount, a
  `privateCollectionIds` prop, edge-swipe stands down while the sheet is open,
  and `normalizeListMarkers` moved out to `lib/answerLayout.ts`.
- `functions/share_service.py` — `_render_shared_answer`,
  `_sanitize_answer_payload`, `"answer"` in `_SHARE_COLLECTIONS`, an
  early return in `_generate_og_preview`, two CSS rules (`.srcs-h`, `.notice`),
  and the not-found copy now reads "This shared page may have been removed."
- `web/lib/answerLayout.ts` — gained `normalizeListMarkers` (moved, verbatim).

**Shared files — read this section before merging**

| file | region | risk |
| --- | --- | --- |
| `web/components/Feed.tsx` | one line at the `<AskBrain>` mount (~2612): `privateCollectionIds={privateCollectionIds}` | none, additive prop |
| `web/components/LinkDetailModal.tsx` | two regions: the `hasSections` line inside the summary IIFE (~1067), and a new "Based on" block above the metadata row (~1264) | low, both localized |
| `web/components/SourceByline.tsx` | one early-return branch for `captureType === 'answer'` before the platform logic, plus a `CitationGlyph` import | low |
| `web/components/Toast.tsx` | optional `action` on the three toast methods | low, additive |
| `web/lib/types.ts` | `captureType` widened to `'text' \| 'answer'`; `answerSources`, `answerRef` on `Link`; `savedCardId`, `shareId` on `ChatMessage`; new `AnswerSource` and `SharedAnswerDoc` | none, all additive |
| `web/lib/collections.ts` | `callShareApi` gained `export` (one word) | none |
| `web/lib/stats.ts` | one `SOURCE_LABEL` entry: `answer: 'Machina answers'` | none |
| `functions/main.py` | the `share_service` import, three docstrings, and the route dispatch inside `share_page` | low, one function |

The `LinkDetailModal` `hasSections` change matters: an answer's
`detailedSummary` is the whole answer, so the existing "slice at the first
`## `" gist-strip would silently delete everything between the first paragraph
and the first heading. Answer cards are exempt and render whole, once.

---

## New Firestore collection, rules, rewrites

- **Collection:** `shared_answers/{shareId}` — world-readable snapshot, written
  only by the Admin SDK through `publish_share_http`. Fields: `shareId`,
  `publishedAt`, `question`, `answer`, `sources[{title,url?}]`, optional
  `ungrounded`. No `ownerUid` (the owner mapping goes to `shared_owners`, as for
  cards and collections), and no card ids.
- **Rules:** added to BOTH `firestore.rules` and `firestore.rules.locked`,
  mirroring `shared_cards` exactly: `allow get: if true; allow list: if false;
  allow write: if false;`. Get-by-id only, never enumerable, no client writes.
- **Rewrites:** `/a` → `share_page` in `firebase.json`, and `/a` →
  `https://secondbrain-app-94da2.web.app/a` in `web/vercel.json`, following the
  existing `/s` and `/c` entries.
- **Deploy note for the supervisor:** the `/a` route only works after BOTH a
  Hosting deploy (the `firebase.json` rewrite) and a functions deploy
  (`share_page`, `publish_share_http`, `unpublish_share_http`). Hosting has
  raced functions twice before on new rewrites, so deploy functions first.
  No new index is needed: the `answerRef` lookup is a single-field equality
  query, which Firestore indexes automatically.

---

## Verified

Run in this session, all green:

```
cd functions && venv/bin/python -m pytest tests -q     # 736 passed (708 on main + 28 new)
cd functions && venv/bin/python -m py_compile *.py
cd web && npx tsc --noEmit                              # exit 0
cd web && node scripts/check-em-dash.mjs                # clean
cd web && npx eslint <every touched file>               # no new problems
cd web && npm run build                                 # static export succeeds
```

`npm run build` needs the `NEXT_PUBLIC_FIREBASE_*` env vars present; without
them it fails at prerender on `auth/invalid-api-key`, on main as well as here.
The one eslint warning on `LinkDetailModal.tsx` (`isYouTube` unused, line 449)
exists on `origin/main` and is not mine.

## NOT verified

- **The Firestore rules emulator suite.** `firebase-tools` is not installed and
  the emulator JAR download is blocked in this session. I added `shared_answers`
  to the existing `firestore-rules-test/rules.test.mjs` — a fixture doc plus the
  collection in the shared `for` loop, so it gets all five existing cases
  (public get, list denied, owner cannot write, stranger and anon cannot write,
  takeover impossible). `rules-tests.yml` runs them on merge. The file passes
  `node --check`.
- **Anything on a device or against a signed-in account.** I cannot run the app
  or sign in here. Not exercised end to end: the Save tap, the toast's Open
  action, the share sheet, a real publish, the rendered `/a` page in a browser,
  the WhatsApp link preview, and native share via `@capacitor/share`.
- **The RTL rendering of the new surfaces** was written to the house rules
  (`dir="auto"` per title, `getDominantDirection` for the question and answer,
  `text-start`, `flex-row-reverse` on the RTL headings) but was never seen
  rendered.

## Owner steps

None beyond the normal deploy. No new secret, env var or console setting.

## Copy strings

English, in the app. No em dashes anywhere.

- Answer actions: `Save` / `Saving…` / `Saved`, `Share` / `Shared`.
- Save toast: `Saved as a card` with an `Open` action.
- Save failure: `Couldn't save this answer. Please try again.`
- Sheet title: `Share answer`; preview kicker `Machina answer`;
  `Sources on the page`; `and N more`.
- Pre-publish: `Sharing creates a page with the question, this answer, and the
  sources it cites. Anyone with the link can view it. Nothing identifies you,
  and the page links to the original sources, never to your cards.`
- Withheld: `1 private card is left out of the public page.` /
  `N private cards are left out of the public page.`
- Ungrounded warning in the sheet: `This answer is not tied to any of your
  saves. The page says so too.`
- Refusal: `This answer is built only from private cards, so it can't be
  shared.` Fallback when sources are missing rather than private: `The cards
  this answer cited are private or no longer in your library, so it can't be
  shared.`
- Checking: `Checking the sources…`
- Buttons: `Create share link` / `Creating…`, `Share link`, `View page`,
  `Stop sharing` / `Stopping…`, `Public`.
- Publish toasts: `Your answer is live`, `Sharing turned off. The public page is
  gone`, `Couldn't publish this answer. Please try again.`, `Couldn't stop
  sharing. Please try again.`, `Share link copied to clipboard`, `Couldn't copy
  the link.`, `Couldn't open the share sheet.`

Hebrew, where the string is CARD CONTENT rather than product chrome (following
the 2026-09-01 round-20 owner call that brand chrome stays English and LTR):

- Graph and Related-cards reason: `Cited in this answer` / `צוטט בתשובה הזו`.
- Detail section heading: `Based on` / `מבוסס על`.

The public share page is English only, like the card and collection pages.

Byline: an answer card reads **Machina answer** with the Citation glyph, on the
card face, the list row and the detail view, because it goes through the shared
`SourceByline`.

## Analytics

Two new events through the existing `track`: `answer_saved_as_card`
(`{ sources, existed }`) and `answer_shared` (`{ sources }`).

## Known edges, for the supervisor to weigh

- **A saved answer card can be shared through the ordinary card-share path**
  (`/s?id=`), which does no vault filtering, because it shares the card's own
  text. If the answer was drawn from private cards, its text can carry that
  material. This is the user deliberately publishing their own card, and it is
  the pre-existing behaviour of card sharing, so I did not change it. The two
  alternatives, auto-vaulting saved answers or blocking card-share for them, are
  product calls I did not make unilaterally.
- **The "Based on" row renders only sources that resolve in the live feed**,
  which matches how `getRelatedCards` treats stored relations. That is
  deliberate rather than incidental: the modal's `allLinks` is the
  vault-filtered feed, so rendering an unresolved source by its stored title
  would surface a private card's title on an ordinary card while the vault is
  locked.
- **`sourceName` is `Machina answer`**, so the Sources facet and Insights list
  answer cards under that label. The server-side byline port in
  `share_service.py` rejects "Machina"-flavoured names for non-Machina hosts, so
  an answer card shared through `/s` would show no byline. Cosmetic, and only on
  that one path.
