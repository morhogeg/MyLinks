// TypeScript interfaces for SecondBrain PWA
// These mirror the Firestore schema from the PRD

export type LinkStatus = 'unread' | 'archived' | 'favorite';

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
  confidence?: string;
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
  status: LinkStatus;
  createdAt: number | string; // Handle both Unix timestamp and ISO string
  metadata: LinkMetadata;
  // AI Analysis metadata
  sourceType?: string;
  sourceName?: string;
  confidence?: string;
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
export type DigestChannel = 'email' | 'whatsapp';
export type DigestMode = 'smart' | 'random' | 'topic' | 'unread' | 'favorites' | 'rediscover';

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
    // Curated digest delivery
    digest_enabled: boolean;
    digest_frequency: DigestFrequency;
    digest_channels: DigestChannel[];
    digest_mode: DigestMode;
    digest_topics: string[];
    digest_topic?: string | null; // legacy single-topic (kept for back-compat)
    digest_count: number;
    digest_hour: number; // 0-23, local time
    digest_day: number;  // 0=Mon … 6=Sun (weekly)
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
