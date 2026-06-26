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

// Request/Response types for API routes
export interface AnalyzeRequest {
  url: string;
}

export interface AnalyzeResponse {
  success: boolean;
  link?: Link;
  error?: string;
}
