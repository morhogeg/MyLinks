/**
 * `firebase/firestore` for the capture build: the real SDK's exports, with
 * every function the app calls answered by the in-memory store instead (an
 * explicit export shadows the `export *` of the same name). Seeded once, at
 * module load, from the demo library. See store.ts for why.
 */
import { captureApi, seedStore } from './store';
import { seedEntries } from './seed';

export * from '@firebase/firestore';
export {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  startAt,
  endAt,
  endBefore,
  documentId,
  getDoc,
  getDocFromServer,
  getDocFromCache,
  getDocs,
  getDocsFromServer,
  getDocsFromCache,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  deleteField,
  arrayUnion,
  arrayRemove,
  increment,
  DocumentReference,
  CollectionReference,
  Query,
  DocumentSnapshot,
  QuerySnapshot,
} from './store';

const db = { type: 'firestore', app: {} };
export const initializeFirestore = () => db;
export const getFirestore = () => db;
export const persistentLocalCache = () => ({});
export const persistentSingleTabManager = () => ({});
export const persistentMultipleTabManager = () => ({});
export const memoryLocalCache = () => ({});
export const connectFirestoreEmulator = () => {};
export const terminate = async () => {};
export const clearIndexedDbPersistence = async () => {};
export const waitForPendingWrites = async () => {};
export const enableNetwork = async () => {};
export const disableNetwork = async () => {};

if (typeof window !== 'undefined') {
  seedStore(seedEntries(Date.now()));
  (window as unknown as { __capture: typeof captureApi }).__capture = captureApi;
}
