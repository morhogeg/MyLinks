// Emulator tests for firestore.rules.locked (the auth-cutover target ruleset).
//
// Mirrors the REAL client access patterns (web/lib/*.ts, AuthProvider):
//   - workspace resolve: LIST query on /users where('authUids','array-contains', me)
//   - owner doc updates (timezone/settings), links/chats/collections CRUD
//   - syntheses / digests: client READ-ONLY (written by Cloud Functions via Admin SDK)
//   - shared_cards / shared_collections: public read, owner-only write
//   - rate_limits / pending_processing / task_logs: never client-accessible
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
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, limit, getDocs, addDoc,
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

test('client cannot create or delete user docs (server-side only)', async () => {
  await assertFails(
    setDoc(doc(strangerDb(), 'users', 'new-user'), { authUids: [STRANGER_AUTH] }),
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

// ── digests: client read-only (in-app Digest section) ────────────────────────

test('owner can read digests (Digest section subscription)', async () => {
  await assertSucceeds(getDoc(doc(ownerDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
  await assertSucceeds(getDocs(collection(ownerDb(), 'users', OWNER_DOC, 'digests')));
});

test('nobody can write digests from the client (Cloud Functions only)', async () => {
  await assertFails(
    setDoc(doc(ownerDb(), 'users', OWNER_DOC, 'digests', '2026-07-06'), { id: '2026-07-06' }),
  );
  await assertFails(
    updateDoc(doc(ownerDb(), 'users', OWNER_DOC, 'digests', '2026-W27'), { title: 'x' }),
  );
});

test('stranger and anon cannot read digests', async () => {
  await assertFails(getDoc(doc(strangerDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
  await assertFails(getDoc(doc(anonDb(), 'users', OWNER_DOC, 'digests', '2026-W27')));
});

// ── shared_cards / shared_collections: public read, Admin-SDK-only write ──────
//
// Writes now go exclusively through publish_share_http / unpublish_share_http
// (Admin SDK) so the world-readable snapshot never carries `ownerUid` (PII). The
// rules therefore deny ALL client writes — including the owner's. This also makes
// the public-share takeover impossible by construction.

for (const col of ['shared_cards', 'shared_collections']) {
  const existing = col === 'shared_cards' ? 'card-share-1' : 'col-share-1';

  test(`${col}: publicly readable, even logged out`, async () => {
    await assertSucceeds(getDoc(doc(anonDb(), col, existing)));
    await assertSucceeds(getDoc(doc(strangerDb(), col, existing)));
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
    // shareIds are public (they appear in /s?id= and /c?id= URLs). Even a
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

for (const col of ['rate_limits', 'pending_processing', 'task_logs', 'usage_quotas']) {
  test(`${col}: denied for owner, stranger, and anon`, async () => {
    await assertFails(getDoc(doc(ownerDb(), col, 'x')));
    await assertFails(setDoc(doc(ownerDb(), col, 'x'), { a: 1 }));
    await assertFails(getDoc(doc(strangerDb(), col, 'x')));
    await assertFails(setDoc(doc(strangerDb(), col, 'x'), { a: 1 }));
    await assertFails(getDoc(doc(anonDb(), col, 'x')));
    await assertFails(setDoc(doc(anonDb(), col, 'x'), { a: 1 }));
  });
}
