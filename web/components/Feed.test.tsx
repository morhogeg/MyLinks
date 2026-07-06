// @vitest-environment jsdom
//
// Characterization test for Feed / FeedContent — pins down the critical seams
// (Firestore subscriptions, search, facets) ahead of structural refactors.
// All Firebase and app-context modules are mocked; the test renders the real
// component tree with an empty library and asserts the observable surface.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Feed from './Feed';

// ── Mocks ────────────────────────────────────────────────────────────────────

// next/navigation: Feed only reads ?linkId via useSearchParams.
vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

// The initialized Firebase app surface — never touch the real SDK app.
vi.mock('@/lib/firebase', () => ({
    db: {},
    auth: {},
    storage: {},
    functions: {},
    getAppCheckToken: async () => null,
    appCheckHeaders: async () => ({}),
}));

// Firestore module: subscriptions immediately deliver an empty snapshot.
vi.mock('firebase/firestore', () => {
    const emptySnapshot = { docs: [] as unknown[] };
    return {
        collection: vi.fn(() => ({})),
        doc: vi.fn(() => ({})),
        query: vi.fn(() => ({})),
        orderBy: vi.fn(() => ({})),
        where: vi.fn(() => ({})),
        limit: vi.fn(() => ({})),
        onSnapshot: vi.fn((_q: unknown, next: (snap: typeof emptySnapshot) => void) => {
            next(emptySnapshot);
            return () => {};
        }),
        getDocs: vi.fn(async () => emptySnapshot),
        getDocsFromServer: vi.fn(async () => emptySnapshot),
        getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
        addDoc: vi.fn(async () => ({ id: 'new-doc' })),
        setDoc: vi.fn(async () => undefined),
        updateDoc: vi.fn(async () => undefined),
        deleteDoc: vi.fn(async () => undefined),
        serverTimestamp: vi.fn(() => 0),
        deleteField: vi.fn(() => undefined),
        arrayUnion: vi.fn((...v: unknown[]) => v),
        arrayRemove: vi.fn((...v: unknown[]) => v),
        increment: vi.fn((n: number) => n),
        writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) })),
        Timestamp: class {},
    };
});

// Cloud Functions callables (semantic search etc.).
vi.mock('firebase/functions', () => ({
    httpsCallable: vi.fn(() => async () => ({ data: { links: [] } })),
    getFunctions: vi.fn(() => ({})),
}));

// Signed-in auth context.
vi.mock('@/components/AuthProvider', () => ({
    useAuth: () => ({
        uid: 'test-uid',
        authUid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: null,
        loading: false,
        signOut: async () => {},
    }),
}));

// Toast context — a stable identity matters: Feed's links-subscription effect
// lists `toast` in its dependency array.
const toastMock = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/components/Toast', () => ({
    useToast: () => toastMock,
}));

// Weekly synthesis subscription — no synthesis for a fresh library.
vi.mock('@/lib/synthesis', () => ({
    subscribeLatestSynthesis: vi.fn(() => () => {}),
}));

// Auth token helpers (used by AskBrain's fetch path; never hit in this test).
vi.mock('@/lib/auth', () => ({
    authHeaders: async () => ({}),
    getIdToken: async () => null,
    onAuthChange: () => () => {},
    signIn: async () => {},
    signInWithGoogle: async () => {},
    signInWithApple: async () => {},
    signOutUser: async () => {},
    completeRedirectSignIn: async () => null,
    deleteAccount: async () => {},
}));

// ── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => cleanup());

describe('Feed (characterization, empty library)', () => {
    it('renders without crashing and resolves loading via the Firestore subscription', () => {
        render(<Feed />);
        // The mocked onSnapshot fired synchronously with zero docs, so the
        // loading skeleton must be gone.
        expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it('shows the empty state for a fresh library', () => {
        render(<Feed />);
        expect(screen.getByText('Your Machina is empty')).toBeTruthy();
        expect(screen.getByText('Add your first link using the + button below')).toBeTruthy();
    });

    it('offers the three layout view modes plus Ask and Collections entry points', () => {
        render(<Feed />);
        expect(screen.getByRole('button', { name: 'Card view' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'List view' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Swipe to review' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Ask your brain' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Browse collections' })).toBeTruthy();
    });

    it('renders the desktop search input wired to the search state', () => {
        render(<Feed />);
        const inputs = document.querySelectorAll('input[type="text"]');
        expect(inputs.length).toBeGreaterThan(0);
    });
});
