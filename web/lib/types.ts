// TypeScript interfaces for SecondBrain PWA
// These mirror the Firestore schema from the PRD

export type LinkStatus = 'unread' | 'archived' | 'favorite';

// Async-capture lifecycle (M3). Items saved via the share sheet are
// written as `processing` the instant they're queued, then flip to a normal
// LinkStatus (ready) or `failed` (retryable) — so a capture is never invisible
// and never silently dropped. A card's `status` field holds one of these while
// in-flight; the feed renders them as skeleton / retry cards.
export type CaptureState = LinkStatus | 'processing' | 'failed';

export interface LinkMetadata {
  originalTitle: string;
  estimatedReadTime: number; // in minutes
  actionableTakeaway?: string;
  // YouTube-specific (populated only for video links)
  videoId?: string;
  watchUrl?: string;
  thumbnailUrl?: string;
  youtubeChannel?: string;
  durationDisplay?: string;
  videoHighlights?: string[]; // each entry prefixed with an "M:SS" timestamp
  speakers?: string[];
}

export interface AIAnalysis {
  language?: string;
  title: string;
  summary: string;
  detailedSummary: string;
  category: string;
  tags: string[];
  concepts?: string[];
  actionableTakeaway: string;
  sourceType?: string;
  sourceName?: string;
  // Backend writes a float score here; some legacy docs stored a string label.
  confidence?: string | number;
  keyEntities?: string[];
  recipe?: {
    ingredients: string[];
    instructions: string[];
    servings?: string;
    prep_time?: string;
    cook_time?: string;
  };
}

export interface Link {
  id: string;
  url: string;
  title: string;
  summary: string;
  detailedSummary?: string;
  tags: string[];
  category: string;
  status: CaptureState;
  createdAt: number | string; // Handle both Unix timestamp and ISO string
  // Async-capture (M3): populated on a `failed` card so the UI can explain what
  // went wrong and offer a retry that re-runs analysis for `url`.
  error?: string;
  failedAt?: number;
  metadata: LinkMetadata;
  // AI Analysis metadata
  sourceType?: string;
  sourceName?: string;
  // Backend writes a float score here; some legacy docs stored a string label.
  confidence?: string | number;
  keyEntities?: string[];

  // Recipe data if applicable
  recipe?: {
    ingredients: string[];
    instructions: string[];
    servings?: string;
    prep_time?: string;
    cook_time?: string;
  };
  // Reminder fields
  reminderStatus?: 'none' | 'pending' | 'completed';
  nextReminderAt?: number; // Unix timestamp (ms)
  reminderCount?: number;
  reminderProfile?: string;
  // In-app fallback: the reminder sweep flips this true when a reminder fires
  // so the feed surfaces it even when the user has no push. Cleared when the
  // user acts on it (opens/dismisses) or re-sets the reminder.
  reminderDue?: boolean;
  reminderDueAt?: number; // Unix timestamp (ms) the reminder came due
  lastViewedAt?: number; // Unix timestamp (ms)
  language?: string;
  isRead?: boolean;

  // Contextual Linking
  concepts?: string[];
  relatedLinks?: RelatedLink[];
  embedding_vector?: number[]; // 768-dim vector for semantic search

  // Collections — ids of the collections this card belongs to. Mirrors `tags`:
  // membership lives on the card so the already-loaded feed can filter in memory.
  collectionIds?: string[];
}

/**
 * A user-curated group of cards (e.g. "Russian literature", "Tesla").
 * Metadata only — membership is stored as `collectionIds` on each Link, and the
 * card count is derived client-side from the loaded feed.
 * Stored at users/{uid}/collections/{collectionId}.
 */
export interface Collection {
  id: string;
  name: string;
  description?: string;
  color?: string;        // a category-color key (see lib/colors.ts)
  coverLinkId?: string;  // optional: the card whose thumbnail is the cover
  createdAt: number;
  updatedAt: number;
  shareId?: string;      // set when published; key into shared_collections/{shareId}
  isPublic?: boolean;
}

/** A frozen, denormalized copy of a card for a public share page. */
export interface SharedCard {
  title: string;
  summary: string;
  detailedSummary?: string;
  url: string;
  category?: string;
  tags?: string[];
  thumbnailUrl?: string;
  sourceName?: string;
  sourceType?: string;
}

/** A published collection snapshot — top-level, world-readable. shared_collections/{shareId}. */
export interface SharedCollection {
  shareId: string;
  ownerUid: string;
  name: string;
  description?: string;
  publishedAt: number;
  cards: SharedCard[];
}

/** A published single-card snapshot — top-level, world-readable. shared_cards/{shareId}. */
export interface SharedCardDoc {
  shareId: string;
  ownerUid: string;
  publishedAt: number;
  card: SharedCard;
}

export interface RelatedLink {
  id: string;
  title: string;
  reason: string;
  similarity: number;
  commonConcepts: string[];
}

export type DigestFrequency = 'daily' | 'weekly';
export type DigestChannel = 'push';
export type ReminderChannel = 'push';
// Three curation modes survive; 'synthesis' is the separate weekly-recap path.
// Retired modes (random/unread/favorites) map to 'smart' at load time — see
// normalizeDigestMode in useUserSettings.ts.
export type DigestMode = 'smart' | 'topic' | 'rediscover' | 'synthesis';

// ── Weekly "What you learned" synthesis (M12) ────────────────────────────────
// A narrative recap of the week's saves, generated server-side (digest_service)
// and stored at users/{uid}/syntheses/{weekId}. Surfaced in-app as a special
// feed card, and pushed as a notification when the push channel is on.
export interface SynthesisTheme {
  title: string;
  insight: string;
  cardIds: string[];
}

/** A denormalized reference to a source card, so the synthesis card renders
 *  even if the underlying link was later deleted. */
export interface SynthesisCardRef {
  id: string;
  title: string;
  category?: string;
}

export interface WeeklySynthesis {
  weekId: string;          // ISO week, e.g. "2026-W27" — also the doc id
  title: string;
  narrative: string;       // 2-4 short paragraphs (may contain \n breaks)
  themes: SynthesisTheme[];
  standoutCardId?: string | null;
  standoutReason?: string;
  openQuestion?: string;
  cards: SynthesisCardRef[]; // all cards referenced across themes + standout
  cardCount: number;         // total saves in the synthesized week
  createdAt: number;         // Unix ms
}

// ── Curated digest (in-app Digest section) ───────────────────────────────────
// Every curated digest is persisted server-side (digest_service) to
// users/{uid}/digests/{digestId} — the always-on surface; push is an
// additional opt-in delivery channel.

/** A card denormalized into the digest doc, so it renders even if the source
 *  link is later deleted (the app still deep-links by id when it exists). */
export interface DigestCardRef {
  id: string;
  title: string;
  category?: string;
  summary?: string;
  thumbnailUrl?: string | null;
  sourceName?: string | null;
  url?: string | null;
}

export interface CuratedDigest {
  id: string;              // deterministic per period: "2026-07-06" / "2026-W28"
  createdAt: number;       // Unix ms
  mode: DigestMode;
  frequency: DigestFrequency;
  title: string;
  topics: string[];
  cards: DigestCardRef[];
  cardCount: number;
}

// TODO: Replace with Firebase Auth user type
export interface User {
  id: string;
  phoneNumber: string; // E.164 format
  email?: string;
  createdAt: number;
  settings: {
    theme: 'dark' | 'light';
    daily_digest: boolean;
    reminders_enabled: boolean;
    reminder_frequency: 'smart' | 'daily' | 'weekly' | 'off';
    // iOS push notifications — flips true after the OS permission is granted.
    push_enabled: boolean;
    reminders_channel: ReminderChannel[];
    // Curated digest delivery
    digest_enabled: boolean;
    digest_frequency: DigestFrequency;
    digest_channels: DigestChannel[];
    digest_mode: DigestMode;
    digest_topics: string[];
    digest_topic?: string | null; // legacy single-topic (kept for back-compat)
    digest_count: number;
    digest_hour: number;   // 0-23, local time
    digest_minute: number; // 0-59, local time
    digest_day: number;    // 0=Mon … 6=Sun (weekly)
    digest_skip_empty: boolean;
  };
}

// ── Ask-your-brain chat ──────────────────────────────────────────────────────
// A citation chip pointing back at a saved link the answer was grounded in.
export interface ChatSource {
  id: string;
  title: string;
  category?: string;
  sourceName?: string | null;
  url?: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  error?: boolean;
  // True when the backend could not tie this answer to any saved card (no valid
  // citation, even after a stricter re-ask). The UI drops the "grounded" promise
  // and shows a downgrade notice in place of the source chips.
  ungrounded?: boolean;
}

/** A saved conversation in the Ask history sidebar (users/{uid}/chats/{id}). */
export interface ChatSession {
  id: string;
  title: string;          // auto-derived from the first user message, editable
  messages: ChatMessage[];
  createdAt: number;      // Date.now()
  updatedAt: number;      // Date.now() — drives sidebar sort (most recent first)
}

// Request/Response types for API routes
export interface AnalyzeRequest {
  url: string;
}

export interface AnalyzeResponse {
  success: boolean;
  link?: Link;
  error?: string;
}
