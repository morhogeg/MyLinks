// TypeScript interfaces for SecondBrain PWA
// These mirror the Firestore schema from the PRD

export type LinkStatus = 'unread' | 'archived' | 'favorite';

export interface LinkMetadata {
  originalTitle: string;
  estimatedReadTime: number; // in minutes
  actionableTakeaway?: string;
}

export interface AIAnalysis {
  title: string;
  summary: string;
  detailedSummary: string;
  category: string;
  tags: string[];
  actionableTakeaway: string;
  sourceType?: string;
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
  lastViewedAt?: number; // Unix timestamp (ms)
}

// TODO: Replace with Firebase Auth user type
export interface User {
  id: string;
  phoneNumber: string; // E.164 format
  createdAt: number;
  settings: {
    theme: 'dark' | 'light';
    daily_digest: boolean;
    reminders_enabled: boolean;
    reminder_frequency: 'smart' | 'daily' | 'weekly' | 'off';
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
