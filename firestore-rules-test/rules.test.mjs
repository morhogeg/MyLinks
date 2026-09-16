// Emulator tests for firestore.rules.locked (the auth-cutover target ruleset).
//
// Mirrors the REAL client access patterns (web/lib/*.ts, AuthProvider):
//   - workspace resolve: LIST query on /users where('authUids','array-contains', me)
//   - owner doc updates (timezone/settings), links/chats/collections CRUD
//   - syntheses / digests: client READ-ONLY (written by Cloud Functions via Admin SDK)
//   - synthesisNotes: the user's own notes on a week — full owner read/write
//   - shared_cards / shared_collections / shared_answers: public read, Admin-only write
//   - rate_limits / pending_processing / task_logs / usage_quotas /
//     entitlements / synthesis_vault: never client-accessible
//
// Run: npm test   (see README.md)

import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, arrayUnion,
  collection, collectionGroup, query, where, limit, getDocs, addDoc,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Fixture ids — mirror production shapes: the data doc is keyed by a phone
// number, and the Firebase Auth uid is a random string linked via authUids.
const OWNER_DOC = '+15551234567';       // Firestore user-doc id (phone number)
const OWNER_AUTH = 'auth-uid-owner';    // Firebase Auth uid linked in authUids
const STRANGER_AUTH = 'auth-uid-stranger'; // signed-in, but linked to nothing

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-machina-rules',
    firestore: {
      rules: readFileSync(join(__dirname, '..', 'firestore.rules.locked'), 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080),
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

// Fresh, known fixture data before every test (written with rules disabled,
// like the Admin SDK does in production for claim_workspace / syntheses).
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', OWNER_DOC), {
      authUids: [OWNER_AUTH],
      email: 'owner@example.com',
      timezone: 'America/New_York',
    });
    await setDoc(doc(db, 'users', OWNER_DOC, 'links', 'link1'), {
      url: 'https://example.com', title: 'A link', status: 'unread',
    });
    await setDoc(doc(db, 'users', OWNER_DOC, 'chats', 'chat1'), {
      title: 'A chat', messages: [],
    });
    await setDoc(doc(db, 'users', OWNER_DOC, 'collections', 'col1'), {
      name: 'A collection', createdAt: 1,
    });
    await setDoc(doc(db, 'users', OWNER_DOC, 'syntheses', '2026-W27'), {
      weekId: '2026-W27', narrative: 'What you learned', createdAt: 1,
    });
    await setDoc(doc(db, 'users', OWNER_DOC, 'digests', '2026-W27'), {
      id: '2026-W27', title: 'Your Weekly Brew', cards: [], createdAt: 1,
    });
    await setDoc(doc(db, 'shared_cards', 'card-share-1'), {
      shareId: 'card-share-1', ownerUid: OWNER_DOC, card: { title: 'Shared' },
    });
    await setDoc(doc(db, 'shared_collections', 'col-share-1'), {
      shareId: 'col-share-1', ownerUid: OWNER_DOC, name: 'Shared col', cards: [],
    });
    // A published Ask answer. Note what the real publish path writes: NO card
    // ids and NO ownerUid — only the question, the answer, and the sources'
    // titles/public URLs (see web/lib/answerShare.ts + share_service.py).
    await setDoc(doc(db, 'shared_answers', 'answer-share-1'), {
      shareId: 'answer-share-1',
      question: 'What did I save about sleep?',
      answer: 'Three of your saves agree on one thing.',
      sources: [{ title: 'Why We Sleep', url: 'https://example.com/sleep' }],
      publishedAt: 1,
    });
    await setDoc(doc(db, 'rate_limits', 'analyze:1.2.3.4'), { count: 1 });
  });
});

const ownerDb = () => testEnv.authenticatedContext(OWNER_AUTH).firestore();
const strangerDb = () => testEnv.authenticatedContext(STRANGER_AUTH).firestore();
const anonDb = () => testEnv.unauthenticatedContext().firestore();

// ── users/{uid}: the workspace doc ───────────────────────────────────────────

test('owner can get their user doc', async () => {
  await assertSucceeds(getDoc(doc(ownerDb(), 'users', OWNER_DOC)));
});

test('owner workspace-resolve LIST query (authUids array-contains) succeeds', async () => {
  // Exactly what AuthProvider.resolveDataDoc runs — the cutover-critical query.
  const q = query(
    collection(ownerDb(), 'users'),
    where('authUids', 'array-contains', OWNER_AUTH),
    limit(1),
  );
  const snap = await assertSucceeds(getDocs(q));
  if (snap.empty || snap.docs[0].id !== OWNER_DOC) {
    throw new Error('workspace-resolve query did not return the owner doc');
  }
});

test('stranger workspace-resolve query succeeds but returns empty', async () => {
  const q = query(
    collection(strangerDb(), 'users'),
    where('authUids', 'array-contains', STRANGER_AUTH),
    limit(1),
  );
  const snap = await assertSucceeds(getDocs(q));
  if (!snap.empty) throw new Error('stranger query unexpectedly returned docs');
});

test('unfiltered legacy first-doc query on /users is denied', async () => {
  // The pre-cutover native fallback (limit(1), no filter) must NOT work.
  await assertFails(getDocs(query(collection(ownerDb(), 'users'), limit(1))));
});

test('owner can update their user doc (timezone/settings write)', async () => {
  await assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { timezone: 'Asia/Jerusalem' }),
  );
});

test('stranger cannot get or update the owner doc', async () => {
  await assertFails(getDoc(doc(strangerDb(), 'users', OWNER_DOC)));
  await assertFails(updateDoc(doc(strangerDb(), 'users', OWNER_DOC), { authUids: [STRANGER_AUTH] }));
});

test('unauthenticated cannot read or write the owner doc', async () => {
  await assertFails(getDoc(doc(anonDb(), 'users', OWNER_DOC)));
  await assertFails(updateDoc(doc(anonDb(), 'users', OWNER_DOC), { timezone: 'x' }));
});

// Self-serve creation (2026-08-26): the client-side fallback in
// AuthProvider.createWorkspaceClientSide — a signed-in account may create
// exactly ONE doc: its own, keyed by its auth uid, linked to itself alone.
test('new account CAN create its own workspace doc (self-serve fallback)', async () => {
  await assertSucceeds(
    setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), {
      authUids: [STRANGER_AUTH], createdAt: 1, onboarded: false,
    }),
  );
});

test('self-serve create is denied for any other doc id', async () => {
  await assertFails(
    setDoc(doc(strangerDb(), 'users', 'some-other-id'), { authUids: [STRANGER_AUTH] }),
  );
});

test('self-serve create cannot seed extra or foreign accounts into authUids', async () => {
  await assertFails(
    setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), {
      authUids: [STRANGER_AUTH, OWNER_AUTH],
    }),
  );
  await assertFails(
    setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), { authUids: [OWNER_AUTH] }),
  );
  await assertFails(
    setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), { createdAt: 1 }),
  );
});

test('self-serve create cannot take over an EXISTING doc (bare setDoc = update there)', async () => {
  // OWNER_DOC exists and STRANGER_AUTH is not linked — the write is an update
  // under rules, and the update rule rejects a non-linked writer. (The id
  // check would also fail it, belt and braces.)
  await assertFails(
    setDoc(doc(strangerDb(), 'users', OWNER_DOC), { authUids: [STRANGER_AUTH] }),
  );
});

// ── users/{uid}: field-level protection (2026-09-16 security pass) ───────────
//
// The update rule used to allow ANY field once the writer was linked. Two
// server-owned fields made that a real hole: `createdAt` is what the founder
// Pro grant keys on (entitlement.grant_for), and `authUids` is how the backend
// resolves a workspace. These cases pin the allowlist from both sides: every
// real client write still works, and every server-owned field is refused.

const CLIENT_WRITES = {
  timezone: 'Asia/Jerusalem',                       // AuthProvider
  'settings.digest_count': 3,                        // lib/storage updateUserSettings (dot path)
  aiConsentAt: 1,                                    // AIConsentNotice
  pushPromptedAt: 1,                                 // PushNudge
  onboarded: true,                                   // AuthProvider
  privacyLock: { hash: 'x', salt: 'y', iterations: 1 }, // lib/privacyLock
  graphVersion: 2,                                   // lib/rebuildConnections
};

for (const [field, value] of Object.entries(CLIENT_WRITES)) {
  test(`owner CAN write client field ${field}`, async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { [field]: value }));
  });
}

test('owner can clear privacyLock (deleteField) and set nested settings', async () => {
  await assertSucceeds(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { privacyLock: { hash: 'x' } }));
  await assertSucceeds(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { privacyLock: deleteField() }));
  await assertSucceeds(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), {
    'settings.digest_enabled': true, 'settings.digest_hour': 8, timezone: 'UTC',
  }));
});

const SERVER_OWNED = {
  createdAt: 0,                       // founder-grant forgery (entitlement.py)
  authUids: [OWNER_AUTH, STRANGER_AUTH], // workspace-resolver hijack (link_service)
  ingestToken: 'a',                   // share-sheet auth, minted server-side
  fcmTokens: ['forged-token'],        // push targets, registered server-side
  lastDigestSentAt: 0,                // digest scheduler state
  email: 'someone-else@example.com',
  plan: 'pro',                        // not a real field, but must not become one
};

for (const [field, value] of Object.entries(SERVER_OWNED)) {
  test(`owner CANNOT write server-owned field ${field}`, async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { [field]: value }));
  });
}

test('owner cannot smuggle a server-owned field in with an allowed one', async () => {
  await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { timezone: 'UTC', createdAt: 0 }));
  await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { timezone: 'UTC', createdAt: deleteField() }));
  await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { onboarded: true, authUids: arrayUnion(STRANGER_AUTH) }));
});

// ── Type guards on the client-writable fields (2026-09-16 round 2) ──────────
//
// The key allowlist alone let `settings: "x"` through, and the schedulers
// read `settings` for every user in one loop: a non-map value raised before
// the per-user try/except and halted reminders / digests for everyone.

const MISTYPED = {
  settings: 'not-a-map',
  timezone: 5,
  aiConsentAt: 'yesterday',
  pushPromptedAt: true,
  onboarded: 'yes',
  privacyLock: 'pin',
  graphVersion: '2',
};

for (const [field, value] of Object.entries(MISTYPED)) {
  test(`owner CANNOT write ${field} with the wrong type`, async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { [field]: value }));
  });
}

test('a mistyped field cannot ride in with a well-typed one', async () => {
  await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { timezone: 'UTC', settings: [] }));
  await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { settings: null }));
});

test('owner cannot grow or shrink authUids from the client', async () => {
  await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { authUids: arrayUnion(STRANGER_AUTH) }));
  await assertFails(updateDoc(doc(ownerDb(), 'users', OWNER_DOC), { authUids: [] }));
});

test('self-serve create must stamp createdAt as now, not a backdated founder date', async () => {
  const now = Date.now();
  await assertSucceeds(
    setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), { authUids: [STRANGER_AUTH], createdAt: now, onboarded: false }),
  );
});

test('self-serve create with a backdated, missing, or non-numeric createdAt is denied', async () => {
  for (const createdAt of [0, 1, Date.now() - 24 * 3600 * 1000, 'now', null]) {
    await assertFails(
      setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), { authUids: [STRANGER_AUTH], createdAt, onboarded: false }),
    );
  }
  await assertFails(
    setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), { authUids: [STRANGER_AUTH], onboarded: false }),
  );
});

test('self-serve create cannot carry server-owned fields', async () => {
  const now = Date.now();
  for (const extra of [{ ingestToken: 'a' }, { fcmTokens: ['t'] }, { plan: 'pro' }, { settings: {} }]) {
    await assertFails(
      setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), { authUids: [STRANGER_AUTH], createdAt: now, ...extra }),
    );
  }
});

test('self-serve create may carry the email (AuthProvider payload shape)', async () => {
  await assertSucceeds(
    setDoc(doc(strangerDb(), 'users', STRANGER_AUTH), {
      authUids: [STRANGER_AUTH], createdAt: Date.now(), onboarded: false, email: 's@example.com',
    }),
  );
});

// ── Deny-by-default probes ───────────────────────────────────────────────────

test('a collection-group query over links is denied for everyone', async () => {
  for (const db of [ownerDb(), strangerDb(), anonDb()]) {
    await assertFails(getDocs(collectionGroup(db, 'links')));
  }
});

test('an unknown top-level collection is denied (no catch-all allow)', async () => {
  for (const db of [ownerDb(), strangerDb(), anonDb()]) {
    await assertFails(getDoc(doc(db, 'migrations', 'x')));
    await assertFails(setDoc(doc(db, 'migrations', 'x'), { a: 1 }));
  }
});

test('the /users list rule is per-caller: a stranger cannot list by the OWNER uid', async () => {
  await assertFails(getDocs(query(
    collection(strangerDb(), 'users'),
    where('authUids', 'array-contains', OWNER_AUTH),
  )));
});

test('anon cannot self-serve create; nobody can delete user docs', async () => {
  await assertFails(
    setDoc(doc(anonDb(), 'users', 'anon-id'), { authUids: ['anon-id'] }),
  );
  await assertFails(deleteDoc(doc(ownerDb(), 'users', OWNER_DOC)));
});

// ── Subcollections: links / chats / collections ──────────────────────────────

for (const sub of ['links', 'chats', 'collections']) {
  test(`owner can read+write users/{uid}/${sub}`, async () => {
    const db = ownerDb();
    await assertSucceeds(getDocs(collection(db, 'users', OWNER_DOC, sub)));
    await assertSucceeds(addDoc(collection(db, 'users', OWNER_DOC, sub), { a: 1 }));
    const existing = sub === 'links' ? 'link1' : sub === 'chats' ? 'chat1' : 'col1';
    await assertSucceeds(updateDoc(doc(db, 'users', OWNER_DOC, sub, existing), { b: 2 }));
    await assertSucceeds(deleteDoc(doc(db, 'users', OWNER_DOC, sub, existing)));
  });

  test(`stranger and anon cannot touch users/{uid}/${sub}`, async () => {
    const existing = sub === 'links' ? 'link1' : sub === 'chats' ? 'chat1' : 'col1';
    await assertFails(getDocs(collection(strangerDb(), 'users', OWNER_DOC, sub)));
    await assertFails(getDoc(doc(strangerDb(), 'users', OWNER_DOC, sub, existing)));
    await assertFails(addDoc(collection(strangerDb(), 'users', OWNER_DOC, sub), { a: 1 }));
    await assertFails(getDoc(doc(anonDb(), 'users', OWNER_DOC, sub, existing)));
    await assertFails(addDoc(collection(anonDb(), 'users', OWNER_DOC, sub), { a: 1 }));
  });
}

// ── links: a reminder cannot be moved into the past ──────────────────────────
//
// The reminder scheduler is ONE query ordered by nextReminderAt across every
// user (limit 500). 500 client-written docs with `nextReminderAt: 1` held the
// head of that query and starved everyone else's reminders. The client only
// ever writes a future time (lib/storage updateLinkReminder) or null.

test('owner can set a reminder for the future, clear it, or leave it untouched', async () => {
  const ref = doc(ownerDb(), 'users', OWNER_DOC, 'links', 'link1');
  await assertSucceeds(updateDoc(ref, { reminderStatus: 'pending', nextReminderAt: Date.now() + 86_400_000 }));
  await assertSucceeds(updateDoc(ref, { title: 'renamed' }));                   // field untouched
  await assertSucceeds(updateDoc(ref, { reminderStatus: 'none', nextReminderAt: null }));
  await assertSucceeds(updateDoc(ref, { nextReminderAt: Date.now() - 60_000 })); // a minute ago: clock skew
  await assertSucceeds(addDoc(collection(ownerDb(), 'users', OWNER_DOC, 'links'), {
    url: 'https://example.com/2', reminderStatus: 'pending', nextReminderAt: Date.now() + 3_600_000,
  }));
});

test('owner cannot backdate a reminder (update or create)', async () => {
  const ref = doc(ownerDb(), 'users', OWNER_DOC, 'links', 'link1');
  await assertFails(updateDoc(ref, { reminderStatus: 'pending', nextReminderAt: 1 }));
  await assertFails(updateDoc(ref, { nextReminderAt: Date.now() - 3_600_000 }));
  await assertFails(updateDoc(ref, { nextReminderAt: 'yesterday' }));
  await assertFails(addDoc(collection(ownerDb(), 'users', OWNER_DOC, 'links'), {
    url: 'https://example.com/3', reminderStatus: 'pending', nextReminderAt: 1,
  }));
});

test('a legacy past nextReminderAt survives an unrelated update, and can still be deleted', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', OWNER_DOC, 'links', 'stale'), {
      url: 'https://example.com/stale', reminderStatus: 'pending', nextReminderAt: 1,
    });
  });
  const ref = doc(ownerDb(), 'users', OWNER_DOC, 'links', 'stale');
  await assertSucceeds(updateDoc(ref, { isRead: true }));  // value unchanged → allowed
  await assertSucceeds(deleteDoc(ref));
});

// ── analytics_events / client_errors: owner-only, client-appended ─────────────
//
// Self-hosted product analytics (lib/analytics.ts) and client error reports
// (lib/errorReporter.ts). The owner appends content-free docs; strangers and
// anon are fully denied. Same owner check as links/chats/collections.

for (const sub of ['analytics_events', 'client_errors']) {
  test(`owner can append and read users/{uid}/${sub}`, async () => {
    const db = ownerDb();
    await assertSucceeds(addDoc(collection(db, 'users', OWNER_DOC, sub), { event: 'x', ts: 1 }));
    await assertSucceeds(getDocs(collection(db, 'users', OWNER_DOC, sub)));
  });

  test(`stranger and anon cannot touch users/{uid}/${sub}`, async () => {
    await assertFails(addDoc(collection(strangerDb(), 'users', OWNER_DOC, sub), { event: 'x', ts: 1 }));
    await assertFails(getDocs(collection(strangerDb(), 'users', OWNER_DOC, sub)));
    await assertFails(addDoc(collection(anonDb(), 'users', OWNER_DOC, sub), { event: 'x', ts: 1 }));
    await assertFails(getDocs(collection(anonDb(), 'users', OWNER_DOC, sub)));
  });
}

// ── syntheses: client read-only ──────────────────────────────────────────────

test('owner can read syntheses (latest-synthesis subscription)', async () => {
  await assertSucceeds(getDoc(doc(ownerDb(), 'users', OWNER_DOC, 'syntheses', '2026-W27')));
  await assertSucceeds(getDocs(collection(ownerDb(), 'users', OWNER_DOC, 'syntheses')));
});

test('nobody can write syntheses from the client (Cloud Functions only)', async () => {
  await assertFails(
    setDoc(doc(ownerDb(), 'users', OWNER_DOC, 'syntheses', '2026-W28'), { weekId: '2026-W28' }),
  );
  await assertFails(
    updateDoc(doc(ownerDb(), 'users', OWNER_DOC, 'syntheses', '2026-W27'), { narrative: 'x' }),
  );
});

test('stranger and anon cannot read syntheses', async () => {
  await assertFails(getDoc(doc(strangerDb(), 'users', OWNER_DOC, 'syntheses', '2026-W27')));
  await assertFails(getDoc(doc(anonDb(), 'users', OWNER_DOC, 'syntheses', '2026-W27')));
});

// ── synthesisNotes: the user's OWN notes on a week — full owner read/write ───
// This is the counterpart to the write-denied `syntheses` doc above: the
// narrative stays Cloud-Function-owned, the margin notes are the user's. These
// cases exist because the "Add a note" button is a direct client write — the
// same shape as the digest Delete button that silently became a no-op under the
// locked ruleset (audit S-9).

test('owner can write, read and clear their own notes on a week', async () => {
  const ref = doc(ownerDb(), 'users', OWNER_DOC, 'synthesisNotes', '2026-W27');
  await assertSucceeds(setDoc(ref, { notes: [{ id: 'n1', text: 'Worth revisiting', createdAt: 1 }], updatedAt: 1 }));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(getDocs(collection(ownerDb(), 'users', OWNER_DOC, 'synthesisNotes')));
  // Editing and removing a note are both the same whole-list write.
  await assertSucceeds(setDoc(ref, { notes: [{ id: 'n1', text: 'Edited', createdAt: 1, updatedAt: 2 }], updatedAt: 2 }));
  await assertSucceeds(setDoc(ref, { notes: [], updatedAt: 3 }));
  await assertSucceeds(deleteDoc(ref));
});

test('a note on a week never opens up the synthesis doc itself', async () => {
  await assertSucceeds(
    setDoc(doc(ownerDb(), 'users', OWNER_DOC, 'synthesisNotes', '2026-W27'), { notes: [], updatedAt: 1 }),
  );
  await assertFails(
    updateDoc(doc(ownerDb(), 'users', OWNER_DOC, 'syntheses', '2026-W27'), { narrative: 'tampered' }),
  );
});

test('stranger and anon cannot touch synthesis notes', async () => {
  await assertFails(getDoc(doc(strangerDb(), 'users', OWNER_DOC, 'synthesisNotes', '2026-W27')));
  await assertFails(getDoc(doc(anonDb(), 'users', OWNER_DOC, 'synthesisNotes', '2026-W27')));
  await assertFails(
    setDoc(doc(strangerDb(), 'users', OWNER_DOC, 'synthesisNotes', '2026-W27'), { notes: [] }),
  );
  await assertFails(
    setDoc(doc(anonDb(), 'users', OWNER_DOC, 'synthesisNotes', '2026-W27'), { notes: [] }),
  );
});

// ── digests: read + delete for the owner, content written by functions ───────

test('owner can read digests (Digest section subscription)', async () => {
  await assertSucceeds(getDoc(doc(ownerDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
  await assertSucceeds(getDocs(collection(ownerDb(), 'users', OWNER_DOC, 'digests')));
});

test('nobody can create or update digests from the client (Cloud Functions only)', async () => {
  await assertFails(
    setDoc(doc(ownerDb(), 'users', OWNER_DOC, 'digests', '2026-07-06'), { id: '2026-07-06' }),
  );
  await assertFails(
    updateDoc(doc(ownerDb(), 'users', OWNER_DOC, 'digests', '2026-W27'), { title: 'x' }),
  );
});

// The per-digest "Delete" action in DigestCard (lib/digest.ts deleteDigest →
// Feed.tsx onDeleteDigest) is a direct client deleteDoc. The ruleset denied ALL
// writes on digests until 2026-07-25, so this action would have started failing
// silently at the cutover — regression guard for audit S-9.
test('owner CAN delete their own digest (DigestCard delete action)', async () => {
  await assertSucceeds(deleteDoc(doc(ownerDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
});

test('stranger and anon cannot delete the owner digest', async () => {
  await assertFails(deleteDoc(doc(strangerDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
  await assertFails(deleteDoc(doc(anonDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
});

test('stranger and anon cannot read digests', async () => {
  await assertFails(getDoc(doc(strangerDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
  await assertFails(getDoc(doc(anonDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
});

// Syntheses stay fully write-denied: unlike digests, the client has no delete
// action for them (Feed dismisses the recap card via localStorage).
test('owner cannot delete a synthesis (no client delete path exists)', async () => {
  await assertFails(deleteDoc(doc(ownerDb(), 'users', OWNER_DOC, 'syntheses', '2026-W27')));
});

// ── shared_cards / shared_collections / shared_answers: public read, ─────────
// ── Admin-SDK-only write ─────────────────────────────────────────────────────
//
// Writes now go exclusively through publish_share_http / unpublish_share_http
// (Admin SDK) so the world-readable snapshot never carries `ownerUid` (PII). The
// rules therefore deny ALL client writes — including the owner's. This also makes
// the public-share takeover impossible by construction.

const SHARE_FIXTURE = {
  shared_cards: 'card-share-1',
  shared_collections: 'col-share-1',
  shared_answers: 'answer-share-1',
};

for (const col of ['shared_cards', 'shared_collections', 'shared_answers']) {
  const existing = SHARE_FIXTURE[col];

  test(`${col}: publicly readable BY ID, even logged out`, async () => {
    await assertSucceeds(getDoc(doc(anonDb(), col, existing)));
    await assertSucceeds(getDoc(doc(strangerDb(), col, existing)));
  });

  test(`${col}: but NOT enumerable — a list query is denied`, async () => {
    // The rule is `allow get`, deliberately not `allow read` (which covers get
    // AND list). Under `allow read: if true` anyone holding the public project
    // id could dump every share doc every user ever published, without having a
    // single one of the links — a share link fetches ONE doc by id. Nothing
    // client-side lists these (or even reads them: /s and /c are rendered by the
    // share_page function through the Admin SDK), so denying list costs nothing.
    for (const db of [anonDb(), strangerDb(), ownerDb()]) {
      await assertFails(getDocs(collection(db, col)));
      await assertFails(getDocs(query(collection(db, col), limit(1))));
    }
  });

  test(`${col}: NO client can write — not even the owner (Admin SDK only)`, async () => {
    // The owner publishes via the Admin-SDK endpoint, never a direct write.
    await assertFails(setDoc(doc(ownerDb(), col, 'new-share'), { x: 1 }));
    await assertFails(updateDoc(doc(ownerDb(), col, existing), { x: 2 }));
    await assertFails(deleteDoc(doc(ownerDb(), col, existing)));
  });

  test(`${col}: strangers and anon cannot write`, async () => {
    await assertFails(setDoc(doc(strangerDb(), col, 'forged'), { ownerUid: OWNER_DOC }));
    await assertFails(updateDoc(doc(strangerDb(), col, existing), { x: 3 }));
    await assertFails(deleteDoc(doc(strangerDb(), col, existing)));
    await assertFails(setDoc(doc(anonDb(), col, 'anon-share'), { x: 1 }));
    await assertFails(deleteDoc(doc(anonDb(), col, existing)));
  });

  test(`${col}: public-share takeover is impossible (all client writes denied)`, async () => {
    // shareIds are public (they appear in /s?id=, /c?id= and /a?id= URLs). Even a
    // signed-in stranger who forges their own ownerUid cannot overwrite the
    // existing share, because client writes to shared_* are denied outright.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', STRANGER_AUTH), {
        authUids: [STRANGER_AUTH],
        email: 'stranger@example.com',
      });
    });
    await assertFails(
      setDoc(doc(strangerDb(), col, existing), {
        ownerUid: STRANGER_AUTH,
        card: { title: 'Phishing' },
      }),
    );
  });
}

// ── shared_owners: functions-only shareId → ownerUid map, never client-visible ─

test('shared_owners: denied for owner, stranger, and anon (read and write)', async () => {
  for (const db of [ownerDb(), strangerDb(), anonDb()]) {
    await assertFails(getDoc(doc(db, 'shared_owners', 'card-share-1')));
    await assertFails(setDoc(doc(db, 'shared_owners', 'x'), { ownerUid: OWNER_DOC }));
  }
});

// ── Functions-only collections: always denied ────────────────────────────────

// `client_error_reports` is in this list for a reason worth stating: it is
// written by an endpoint that accepts UNAUTHENTICATED reports, so the only
// thing keeping its rate limit and field truncation meaningful is that clients
// cannot reach the collection directly. Reads stay denied because the records
// carry an auth uid and an IP.
for (const col of ['rate_limits', 'pending_processing', 'task_logs', 'usage_quotas', 'server_errors', 'client_error_reports', 'entitlements', 'synthesis_vault']) {
  test(`${col}: denied for owner, stranger, and anon`, async () => {
    await assertFails(getDoc(doc(ownerDb(), col, 'x')));
    await assertFails(setDoc(doc(ownerDb(), col, 'x'), { a: 1 }));
    await assertFails(getDoc(doc(strangerDb(), col, 'x')));
    await assertFails(setDoc(doc(strangerDb(), col, 'x'), { a: 1 }));
    await assertFails(getDoc(doc(anonDb(), col, 'x')));
    await assertFails(setDoc(doc(anonDb(), col, 'x'), { a: 1 }));
  });
}
