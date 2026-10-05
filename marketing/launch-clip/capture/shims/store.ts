/**
 * An in-memory stand-in for the slice of the Firestore SDK the app uses.
 *
 * WHY THIS EXISTS: the reel shows the ACTUAL app, not a rebuilt mockup, so
 * `capture/build-app.mjs` builds the real `web/` source and only swaps the
 * `firebase/*` modules for these shims. Every component, hook, style and
 * interaction in the captures is the shipped code; what changes is where the
 * data comes from (the demo library in `capture/library.mjs`, seeded below)
 * instead of a signed-in production account. The Firebase emulator would be
 * the textbook way to do this, but its JAR is not downloadable from this
 * sandbox (see SOURCE_OF_TRUTH.md §4).
 *
 * Scope is deliberately "what the app calls", not "all of Firestore": docs and
 * collections by path, where / orderBy / limit / startAfter / endAt, live
 * listeners, writes with the field-value sentinels the app uses, batches and
 * transactions. Anything else the app might reach falls through to the real
 * SDK's export (see firestore.ts) and would fail loudly, which is what we want.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Data = Record<string, any>;

const docs = new Map<string, Data>();
const listeners = new Set<() => void>();

// ─────────────────────────────────────────────────────── field values

const FV = '__captureFieldValue';
type FieldValue =
  | { [FV]: 'serverTimestamp' }
  | { [FV]: 'deleteField' }
  | { [FV]: 'arrayUnion'; values: unknown[] }
  | { [FV]: 'arrayRemove'; values: unknown[] }
  | { [FV]: 'increment'; by: number };

export const serverTimestamp = () => ({ [FV]: 'serverTimestamp' }) as FieldValue;
export const deleteField = () => ({ [FV]: 'deleteField' }) as FieldValue;
export const arrayUnion = (...values: unknown[]) => ({ [FV]: 'arrayUnion', values }) as FieldValue;
export const arrayRemove = (...values: unknown[]) => ({ [FV]: 'arrayRemove', values }) as FieldValue;
export const increment = (by: number) => ({ [FV]: 'increment', by }) as FieldValue;

const isFV = (v: unknown): v is FieldValue => !!v && typeof v === 'object' && FV in (v as object);
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const resolveValue = (current: unknown, v: unknown): unknown => {
  if (!isFV(v)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Data = {};
      for (const [k, x] of Object.entries(v as Data)) {
        const r = resolveValue(undefined, x);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    return v;
  }
  switch (v[FV]) {
    case 'serverTimestamp':
      return Date.now();
    case 'deleteField':
      return undefined;
    case 'arrayUnion': {
      const arr = Array.isArray(current) ? [...current] : [];
      for (const x of v.values) if (!arr.some((y) => eq(x, y))) arr.push(x);
      return arr;
    }
    case 'arrayRemove':
      return Array.isArray(current) ? current.filter((y) => !v.values.some((x) => eq(x, y))) : [];
    case 'increment':
      return (typeof current === 'number' ? current : 0) + v.by;
  }
};

/** Apply `patch` to `base`, honouring dotted field paths (`a.b`) like updateDoc. */
const applyPatch = (base: Data, patch: Data, dotted: boolean): Data => {
  const out: Data = structuredClone(base);
  for (const [key, raw] of Object.entries(patch)) {
    const path = dotted ? key.split('.') : [key];
    let node: Data = out;
    for (let i = 0; i < path.length - 1; i++) {
      if (!node[path[i]] || typeof node[path[i]] !== 'object') node[path[i]] = {};
      node = node[path[i]];
    }
    const leaf = path[path.length - 1];
    const next = resolveValue(node[leaf], raw);
    if (next === undefined) delete node[leaf];
    else node[leaf] = next;
  }
  return out;
};

// ─────────────────────────────────────────────────────── references

let autoId = 0;
const newId = () => `cap${Date.now().toString(36)}${(autoId++).toString(36)}`;

export class DocumentReference {
  readonly type = 'document';
  constructor(readonly path: string) {}
  get id() {
    return this.path.split('/').pop() as string;
  }
  get parent() {
    return new CollectionReference(this.path.split('/').slice(0, -1).join('/'));
  }
  withConverter() {
    return this;
  }
}

export class CollectionReference {
  readonly type = 'collection';
  constructor(readonly path: string) {}
  get id() {
    return this.path.split('/').pop() as string;
  }
  withConverter() {
    return this;
  }
}

type Constraint =
  | { kind: 'where'; field: string; op: string; value: unknown }
  | { kind: 'orderBy'; field: string; dir: 'asc' | 'desc' }
  | { kind: 'limit'; n: number }
  | { kind: 'startAfter' | 'startAt' | 'endAt' | 'endBefore'; at: unknown[] };

export class Query {
  readonly type = 'query';
  constructor(
    readonly path: string,
    readonly constraints: Constraint[],
  ) {}
  withConverter() {
    return this;
  }
}

const DOC_ID = '__name__';
export const documentId = () => DOC_ID;

const joinPath = (segments: string[]) => segments.filter(Boolean).join('/');

export function collection(parent: unknown, ...segments: string[]): CollectionReference {
  const base = parent instanceof DocumentReference || parent instanceof CollectionReference ? parent.path : '';
  return new CollectionReference(joinPath([base, ...segments]));
}

export function doc(parent: unknown, ...segments: string[]): DocumentReference {
  const base = parent instanceof DocumentReference || parent instanceof CollectionReference ? parent.path : '';
  if (parent instanceof CollectionReference && segments.length === 0) {
    return new DocumentReference(joinPath([base, newId()]));
  }
  return new DocumentReference(joinPath([base, ...segments]));
}

export const where = (field: string, op: string, value: unknown): Constraint => ({
  kind: 'where',
  field,
  op,
  value,
});
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc'): Constraint => ({
  kind: 'orderBy',
  field,
  dir,
});
export const limit = (n: number): Constraint => ({ kind: 'limit', n });
export const startAfter = (...at: unknown[]): Constraint => ({ kind: 'startAfter', at });
export const startAt = (...at: unknown[]): Constraint => ({ kind: 'startAt', at });
export const endAt = (...at: unknown[]): Constraint => ({ kind: 'endAt', at });
export const endBefore = (...at: unknown[]): Constraint => ({ kind: 'endBefore', at });

export function query(ref: CollectionReference | Query, ...constraints: Constraint[]): Query {
  if (ref instanceof Query) return new Query(ref.path, [...ref.constraints, ...constraints]);
  return new Query(ref.path, constraints.filter(Boolean));
}

// ─────────────────────────────────────────────────────── snapshots

export class DocumentSnapshot {
  readonly metadata = { fromCache: false, hasPendingWrites: false };
  constructor(
    readonly ref: DocumentReference,
    private readonly value: Data | undefined,
  ) {}
  get id() {
    return this.ref.id;
  }
  exists() {
    return this.value !== undefined;
  }
  data() {
    return this.value === undefined ? undefined : structuredClone(this.value);
  }
  get(field: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return field.split('.').reduce<any>((v, k) => (v == null ? undefined : v[k]), this.value);
  }
}

export class QuerySnapshot {
  readonly metadata = { fromCache: false, hasPendingWrites: false };
  constructor(
    readonly query: Query | CollectionReference,
    readonly docs: DocumentSnapshot[],
  ) {}
  get size() {
    return this.docs.length;
  }
  get empty() {
    return this.docs.length === 0;
  }
  forEach(fn: (d: DocumentSnapshot) => void) {
    this.docs.forEach(fn);
  }
  docChanges() {
    return this.docs.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i }));
  }
}

// ─────────────────────────────────────────────────────── evaluation

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fieldOf = (id: string, data: Data, field: string): any =>
  field === DOC_ID ? id : field.split('.').reduce<any>((v, k) => (v == null ? undefined : v[k]), data);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const norm = (v: any) => (v && typeof v === 'object' && typeof v.toMillis === 'function' ? v.toMillis() : v);

const cmp = (a: unknown, b: unknown) => {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 0;
  if (x === undefined || x === null) return -1;
  if (y === undefined || y === null) return 1;
  return x < y ? -1 : 1;
};

const matches = (id: string, data: Data, c: Extract<Constraint, { kind: 'where' }>) => {
  const v = fieldOf(id, data, c.field);
  const val = c.value;
  switch (c.op) {
    case '==':
      return eq(norm(v), norm(val));
    case '!=':
      return v !== undefined && !eq(norm(v), norm(val));
    case '<':
      return v !== undefined && cmp(v, val) < 0;
    case '<=':
      return v !== undefined && cmp(v, val) <= 0;
    case '>':
      return v !== undefined && cmp(v, val) > 0;
    case '>=':
      return v !== undefined && cmp(v, val) >= 0;
    case 'array-contains':
      return Array.isArray(v) && v.some((x) => eq(x, val));
    case 'array-contains-any':
      return Array.isArray(v) && Array.isArray(val) && v.some((x) => val.some((y) => eq(x, y)));
    case 'in':
      return Array.isArray(val) && val.some((y) => eq(norm(v), norm(y)));
    case 'not-in':
      return v !== undefined && Array.isArray(val) && !val.some((y) => eq(norm(v), norm(y)));
    default:
      throw new Error(`capture store: unsupported where op ${c.op}`);
  }
};

const childrenOf = (colPath: string) => {
  const depth = colPath.split('/').length + 1;
  const out: [string, Data][] = [];
  for (const [path, data] of docs) {
    if (path.startsWith(colPath + '/') && path.split('/').length === depth) out.push([path, data]);
  }
  return out;
};

const run = (q: Query | CollectionReference): DocumentSnapshot[] => {
  const constraints = q instanceof Query ? q.constraints : [];
  let rows = childrenOf(q.path).map(([path, data]) => ({ id: path.split('/').pop() as string, path, data }));
  for (const c of constraints) if (c.kind === 'where') rows = rows.filter((r) => matches(r.id, r.data, c));
  const orders = constraints.filter((c): c is Extract<Constraint, { kind: 'orderBy' }> => c.kind === 'orderBy');
  const sortKey = [...orders, { kind: 'orderBy' as const, field: DOC_ID, dir: orders[orders.length - 1]?.dir ?? 'asc' }];
  rows.sort((a, b) => {
    for (const o of sortKey) {
      const d = cmp(fieldOf(a.id, a.data, o.field), fieldOf(b.id, b.data, o.field));
      if (d) return o.dir === 'desc' ? -d : d;
    }
    return 0;
  });
  // cursors: a DocumentSnapshot cursor is resolved to its position in the
  // sorted rows; value cursors compare against the first orderBy field.
  const position = (at: unknown[]) => {
    const first = at[0];
    if (first instanceof DocumentSnapshot) return { id: first.id };
    return { value: first };
  };
  const before = (r: (typeof rows)[number], at: unknown[]) => {
    const p = position(at);
    if ('id' in p) return rows.indexOf(r) - rows.findIndex((x) => x.id === p.id);
    const o = orders[0];
    const d = cmp(fieldOf(r.id, r.data, o.field), p.value);
    return o.dir === 'desc' ? -d : d;
  };
  for (const c of constraints) {
    if (c.kind === 'startAfter') rows = rows.filter((r) => before(r, c.at) > 0);
    if (c.kind === 'startAt') rows = rows.filter((r) => before(r, c.at) >= 0);
    if (c.kind === 'endAt') rows = rows.filter((r) => before(r, c.at) <= 0);
    if (c.kind === 'endBefore') rows = rows.filter((r) => before(r, c.at) < 0);
  }
  const lim = constraints.find((c): c is Extract<Constraint, { kind: 'limit' }> => c.kind === 'limit');
  if (lim) rows = rows.slice(0, lim.n);
  return rows.map((r) => new DocumentSnapshot(new DocumentReference(r.path), r.data));
};

// ─────────────────────────────────────────────────────── reads

/**
 * "Arrives from the network": a macrotask that does NOT go through setTimeout.
 * Real Firestore answers on network I/O, which is independent of JS timers, and
 * the capture freezes the timer clock (Playwright's fake clock) while it steps
 * frames; a setTimeout here would hold every read until the next frame and
 * reorder the app's own async work (it did: the graph lost its Ask hand-off).
 */
const io = (fn: () => void) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    ch.port1.close();
    fn();
  };
  ch.port2.postMessage(0);
};
const later = <T,>(v: T) => new Promise<T>((r) => io(() => r(v)));

export const getDoc = (ref: DocumentReference) => later(new DocumentSnapshot(ref, docs.get(ref.path)));
export const getDocFromServer = getDoc;
export const getDocFromCache = getDoc;
export const getDocs = (q: Query | CollectionReference) => later(new QuerySnapshot(q, run(q)));
export const getDocsFromServer = getDocs;
export const getDocsFromCache = getDocs;

export function onSnapshot(target: unknown, ...args: unknown[]) {
  // (ref, next, error?) or (ref, options, next, error?) or (ref, {next, error})
  let next: ((s: unknown) => void) | undefined;
  const rest = args.filter((a) => a !== undefined);
  if (typeof rest[0] === 'function') next = rest[0] as (s: unknown) => void;
  else if (typeof rest[1] === 'function') next = rest[1] as (s: unknown) => void;
  else if (rest[0] && typeof (rest[0] as { next?: unknown }).next === 'function')
    next = (rest[0] as { next: (s: unknown) => void }).next;
  let alive = true;
  let last = '';
  const emit = () => {
    if (!alive || !next) return;
    const snap =
      target instanceof DocumentReference
        ? new DocumentSnapshot(target, docs.get(target.path))
        : new QuerySnapshot(target as Query, run(target as Query));
    // Only re-emit when the result actually changed — a real listener is quiet
    // on unrelated writes, and the app's effects assume that.
    const key = JSON.stringify(
      snap instanceof DocumentSnapshot ? snap.data() ?? null : snap.docs.map((d) => [d.id, d.data()]),
    );
    if (key === last) return;
    last = key;
    next(snap);
  };
  const listener = () => io(emit);
  listeners.add(listener);
  io(emit);
  return () => {
    alive = false;
    listeners.delete(listener);
  };
}

// ─────────────────────────────────────────────────────── writes

const notify = () => listeners.forEach((l) => l());

const writeDoc = (path: string, data: Data, merge: boolean) => {
  const base = merge ? docs.get(path) ?? {} : {};
  docs.set(path, applyPatch(base, data, false));
};

export async function setDoc(ref: DocumentReference, data: Data, opts?: { merge?: boolean }) {
  writeDoc(ref.path, data, !!opts?.merge);
  notify();
}

export async function addDoc(col: CollectionReference, data: Data) {
  const ref = doc(col);
  writeDoc(ref.path, data, false);
  notify();
  return ref;
}

export async function updateDoc(ref: DocumentReference, data: Data) {
  const base = docs.get(ref.path);
  if (!base) throw Object.assign(new Error(`No document to update: ${ref.path}`), { code: 'not-found' });
  docs.set(ref.path, applyPatch(base, data, true));
  notify();
}

export async function deleteDoc(ref: DocumentReference) {
  docs.delete(ref.path);
  notify();
}

export function writeBatch() {
  const ops: (() => void)[] = [];
  const batch = {
    set(ref: DocumentReference, data: Data, opts?: { merge?: boolean }) {
      ops.push(() => writeDoc(ref.path, data, !!opts?.merge));
      return batch;
    },
    update(ref: DocumentReference, data: Data) {
      ops.push(() => {
        const base = docs.get(ref.path);
        if (base) docs.set(ref.path, applyPatch(base, data, true));
      });
      return batch;
    },
    delete(ref: DocumentReference) {
      ops.push(() => docs.delete(ref.path));
      return batch;
    },
    async commit() {
      ops.forEach((op) => op());
      notify();
    },
  };
  return batch;
}

export async function runTransaction<T>(_db: unknown, fn: (tx: unknown) => Promise<T>): Promise<T> {
  const batch = writeBatch();
  const tx = {
    get: (ref: DocumentReference) => getDoc(ref),
    set: (ref: DocumentReference, data: Data, opts?: { merge?: boolean }) => (batch.set(ref, data, opts), tx),
    update: (ref: DocumentReference, data: Data) => (batch.update(ref, data), tx),
    delete: (ref: DocumentReference) => (batch.delete(ref), tx),
  };
  const out = await fn(tx);
  await batch.commit();
  return out;
}

// ─────────────────────────────────────────────────────── seeding + driving

/** Replace the whole store (called once at module load with the demo library). */
export function seedStore(entries: [string, Data][]) {
  docs.clear();
  for (const [path, data] of entries) docs.set(path, structuredClone(data));
  notify();
}

/**
 * The capture script drives state changes that production would get from the
 * BACKEND (a card finishing analysis, a digest arriving) through this hook on
 * `window.__capture`, so the app reacts exactly as it does to a server write.
 */
export const captureApi = {
  set: (path: string, data: Data) => {
    writeDoc(path, data, false);
    notify();
  },
  merge: (path: string, data: Data) => {
    writeDoc(path, data, true);
    notify();
  },
  remove: (path: string) => {
    docs.delete(path);
    notify();
  },
  get: (path: string) => docs.get(path),
  list: (prefix: string) => [...docs.keys()].filter((k) => k.startsWith(prefix)),
};
