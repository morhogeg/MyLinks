// TypeScript interfaces for SecondBrain PWA
// These mirror the Firestore schema from the PRD

export type LinkStatus = 'unread' | 'archived' | 'favorite';

export interface LinkMetadata {
  originalTitle: string;
  estimatedReadTime: number; // in minutes
}

export interface AIAnalysis {
  title: string;
  summary: string;
  category: string;
  tags: string[];
  actionable_takeaway: string;
}

export interface Link {
  id: string;
  url: string;
  title: string;
  summary: string;
  tags: string[];
  category: string;
  status: LinkStatus;
  createdAt: number; // Unix timestamp (ms) - Firestore would use Timestamp
  metadata: LinkMetadata;
}

// TODO: Replace with Firebase Auth user type
export interface User {
  id: string;
  phoneNumber: string; // E.164 format
  createdAt: number;
  settings: {
    theme: 'dark' | 'light';
    dailyDigest: boolean;
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
