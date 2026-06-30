# Spec: Shared Brains — Collaborative Collections

> **Status:** Spec, ready to build. **Decisions locked:** Model C (self-contained
> collections) · Separate UIDs · No auth (2-person, trust-based) · `memberId === uid`.
> **Scope:** Let two people (you + your wife) contribute to the same collection in real
> time, from any capture channel, with attribution and live sync. This is the household
> version of "shared brains" and the prototype for the viral multiplayer feature later.

---

## 1. Goal

Two people contribute to the **same collection** together:
- Either person adds links to a shared collection from any channel (card, add-link, WhatsApp, extension).
- Both see additions instantly, with "Added by {name}" attribution.
- No login, no OAuth, no locked rules — mutual trust between two known people.

**In scope:** shared collections, multi-contributor adds, attribution, live sync, a
no-auth invite/join, and integration with Ask + Digest.

**Out of scope (deferred to T1 / real auth):** real per-user identity, access control,
private-within-shared, and sharing with anyone on the internet.

---

## 2. Locked decisions & their consequences

| Decision | Consequence |
|---|---|
| **Model C** — collections are self-contained copies of cards | A shared collection owns its own `items`; it does **not** depend on either person's private library staying intact. No re-analysis on add (copy the already-analyzed fields). |
| **Separate UIDs** — you and your wife each load your own `users/{uid}` | Personal libraries stay **private**; only collections are shared. Shared collections live at a **top-level** path so they're reachable regardless of which uid a device loads. |
| **`memberId === uid`** | No parallel "profile" concept. The uid **is** the identity. The one-time "Who are you?" picker is a **uid picker**. |
| **No auth** | Membership and joins are plain Firestore writes (rules open today). Documented upgrade path to T1 below. |

---

## 3. Identity model (no auth, `memberId === uid`)

- **First run on a device** shows a one-time picker — "Who are you?" → *Mor* / *[Wife]* /
  "Create profile". This **selects or creates a `users/{uid}` doc** and stores the chosen
  uid in `localStorage` (`myUid`). This single mechanism gives both the per-device identity
  **and** the separate-uid requirement.
- A tiny shared **`members/{uid}`** doc holds display info for attribution chips:
  `{ name, color, emoji }`.
- Re-openable from Settings ("Switch user").
- **Forward-compat:** because `memberId` is already a uid, T1 is a rules flip
  (`request.auth.uid in resource.data.memberIds`) with **no identity backfill**.

---

## 4. Data model (Firestore)

New **top-level** structures (outside `users/{uid}` so both devices reach them):

```
collections/{collectionId}
  name:        string
  emoji:       string            // e.g. "🍳"
  color:       string            // accent token
  coverImage?: string
  memberIds:   string[]          // [morUid, wifeUid]
  createdBy:   uid
  createdAt:   ms
  updatedAt:   ms
  inviteCode:  string            // 6-char, for join (§7)
  isShared:    true
  // cheap UI rollups, updated on add/remove:
  itemCount:   number
  lastItem?:   { title, addedBy, addedAt }

collections/{collectionId}/items/{itemId}
  // SELF-CONTAINED card (Model C): reuse the existing Link schema fields —
  // title, url, summary, detailedSummary, category, tags, platform, thumbnail,
  // metadata.youtubeChannel, embedding_vector, readTime, …
  addedBy:       uid
  addedAt:       ms
  sourceLinkId?: string          // the user's personal card it was copied from
  sourceUid?:    string          // = addedBy, kept explicit for clarity

members/{uid}                    // tiny shared registry for attribution
  name, color, emoji, createdAt
```

**Copy-on-add (Model C):** "Add to collection" copies the analyzed card from
`users/{myUid}/links/{id}` into `collections/{cid}/items`, stamping `addedBy = myUid`.
No re-analysis. The collection is independent of either personal library (robust to the
other person deleting their copy). Storage cost at household scale is negligible.

---

## 5. Adding to a shared collection (all capture channels)

1. **From an existing card** → "Add to collection" picker (multi-select; lists shared
   collections + "New collection"). Copies the analyzed card into `items`, `addedBy = myUid`.
2. **From AddLinkForm** → optional "Add to…" target. New link analyzes as today, then the
   result is copied into the chosen shared collection (and/or saved personally).
3. **WhatsApp** *(the standout for a couple)* → route a forwarded link straight into a
   shared collection by caption/keyword: forward a link with `#recipes` or `to Recipes`, it
   lands in that collection. Reuses the existing Twilio webhook + `process_link_background`;
   adds collection routing + an "added to Recipes ✅" reply. Unknown keyword → normal
   personal save (never lose a link).
4. **Browser extension / iOS Shortcut** → optional "default collection" so one tap files
   into the shared brain.

All paths set `addedBy`, `addedAt`, and `sourceLinkId`/`sourceUid`.

---

## 6. Real-time collaboration & attribution

- **Live sync:** `onSnapshot` on `collections/{id}/items`, mirroring the patterns in
  `web/lib/chats.ts` / `web/lib/storage.ts`. New cards appear without refresh.
- **Attribution:** each card shows an "Added by {name}" chip with the member's color/emoji
  avatar (from `members/{uid}`).
- **"New since you last looked":** per-device `lastSeen[collectionId]` in localStorage;
  badge a collection with the count of items added by the *other* member since then.
- **(Phase 3, optional)** a thin activity strip: "Mor added 3 · [Wife] added 1 today."

---

## 7. Invite / join flow (no auth)

- Each shared collection has a 6-char `inviteCode` and a share link (`/join/{code}`).
- Your wife opens the link → app asks "Who are you?" (§3) if `myUid` isn't set → adds her
  uid to `memberIds` → the collection appears in her **Shared** list.
- Because rules are open today, this is a plain Firestore write; no tokens. **At T1 this
  becomes a proper membership grant.**

---

## 8. UI surfaces

- **Nav/sidebar "Shared" section:** lists shared collections with member avatars + a
  new-item badge. Sits alongside the existing (personal) collections.
- **Collection view:** reuse the `Feed`/`Card` grid. Header = emoji + name + member avatars
  + **Add**, **Ask this collection**, **Digest** toggle, and an overflow menu
  (rename / invite / leave / delete).
- **Create-collection modal:** name, emoji, color, "Invite [Wife]" (shows code + link).
- **"Add to collection" picker:** multi-select sheet; shared collections pinned on top;
  "+ New collection".
- **Member identity picker:** one-time per device; re-openable from Settings.
- All using the Tailwind tokens (`bg-card`, `text-text`, `bg-accent`,
  `var(--accent-gradient)`), light/dark + RTL aware, with the mobile bottom-sheet pattern
  already in `Feed.tsx`.

---

## 9. Ask Your Brain + Digest integration (high-value reuse)

- **Ask scope selector:** a dropdown on the Ask view — "Everything" / a specific shared
  collection. `ask_brain` accepts a `collectionId`; retrieval (vector + keyword fallback)
  filters to that collection's `items`. → "Ask our Recipes brain." *(Needs a Firestore
  vector index on `collections/{id}/items.embedding_vector`.)*
- **Digest source = shared collection:** extend `digest_service.py` so a shared collection
  can be a curation source, delivered to **both** members' channels (WhatsApp/email). →
  "Your weekly Recipes digest."

---

## 10. Permissions (intentionally minimal)

- **All members:** add items, remove items, view, rename.
- **Creator only:** delete the collection, remove members.
- No roles, no private-within-shared. Deliberate trust-based model for the no-auth phase.

---

## 11. Edge cases

- **Duplicate add** (URL already in the collection): dedup by normalized URL → toast
  "Already in Recipes", no double-insert.
- **Two simultaneous adds:** independent item docs, no conflict.
- **Remove vs. personal copy:** removing a shared item never touches anyone's personal
  library (Model C copies are independent).
- **Member leaves:** uid drops from `memberIds`; their contributed items remain (attribution
  kept).
- **Unknown WhatsApp keyword:** falls back to normal personal save.
- **Analysis failure on add:** item still appears with a "needs retry" state, consistent
  with existing failed-card handling.

---

## 12. Backend (Cloud Functions) changes

- `functions/main.py`: `create_collection`, `join_collection`, `add_to_collection`,
  `remove_from_collection`; WhatsApp webhook keyword routing.
- `functions/digest_service.py`: shared-collection as a digest source + dual-recipient
  delivery.
- `ask_brain`: accept + filter by `collectionId`.
- `functions/models.py`: `Collection`, `CollectionItem`, `Member` shapes.
- `firestore.rules`: open `collections/**` now; documented
  `request.auth.uid in resource.data.memberIds` upgrade for T1.

---

## 13. Phased rollout

- **Phase 1 (core):** data model, member/uid picker, create/invite/join, collection view,
  "Add to collection" from a card, live sync + attribution. *Usable end-to-end by two people.*
- **Phase 2 (capture reach):** AddLinkForm target, **WhatsApp keyword routing**,
  extension/Shortcut default collection.
- **Phase 3 (intelligence):** Ask-this-collection scope, shared-collection digests,
  "new since" badges / activity strip.

---

## 14. Forward-compat with real auth (T1)

Everything keys off `uid` arrays and the top-level `collections/`. At T1: flip
`firestore.rules` from open to `request.auth.uid in resource.data.memberIds`. No structural
migration — `memberId` is already a uid.

---

## 15. New web modules (suggested, for when we build)

- `web/lib/collections.ts` — types (`SharedCollection`, `CollectionItem`, `Member`) + CRUD
  + `onSnapshot` subscriptions (mirror `web/lib/chats.ts`).
- `web/lib/identity.ts` — the `myUid` picker + `members/{uid}` read/write.
- `web/components/SharedCollections/` — list, collection view, create modal, add-to picker,
  member picker.
- Touch-points: an "Add to collection" action on `web/components/Card.tsx` /
  `LinkDetailModal.tsx`; a "Shared" entry in the nav.

> **Integration note:** this clone does not contain the finalized (personal) collections
> code. When that lands on the branch, reconcile the "promote a personal collection → shared"
> hook and reuse its types/UI for visual consistency. The shared layer above is otherwise
> self-contained.
