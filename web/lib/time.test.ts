import { describe, it, expect } from 'vitest';
import { toMillis, formatTimeAgo } from './time';

describe('toMillis', () => {
  it('passes through a millisecond number', () => {
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('parses an ISO string', () => {
    expect(toMillis('2023-11-14T22:13:20.000Z')).toBe(Date.parse('2023-11-14T22:13:20.000Z'));
  });

  it('reads a Firestore-style { seconds } value', () => {
    expect(toMillis({ seconds: 1_700 })).toBe(1_700_000);
  });

  it('reads a { toMillis } value', () => {
    expect(toMillis({ toMillis: () => 42 })).toBe(42);
  });

  it('returns 0 for null/undefined/garbage', () => {
    expect(toMillis(null)).toBe(0);
    expect(toMillis(undefined)).toBe(0);
    expect(toMillis('not a date')).toBe(0);
  });
});

describe('formatTimeAgo', () => {
  const now = 1_700_000_000_000;

  it('shows a placeholder without a timestamp or clock', () => {
    expect(formatTimeAgo(0, now, false)).toBe('...');
    expect(formatTimeAgo(now, 0, false)).toBe('...');
  });

  it('formats seconds/minutes/hours/days in English', () => {
    expect(formatTimeAgo(now - 5_000, now, false)).toBe('just now');
    expect(formatTimeAgo(now - 5 * 60_000, now, false)).toBe('5m ago');
    expect(formatTimeAgo(now - 3 * 3_600_000, now, false)).toBe('3h ago');
    expect(formatTimeAgo(now - 2 * 86_400_000, now, false)).toBe('2d ago');
  });

  it('formats in Hebrew when isRtl', () => {
    expect(formatTimeAgo(now - 5_000, now, true)).toBe('זה עתה');
    expect(formatTimeAgo(now - 5 * 60_000, now, true)).toBe('לפני 5 דק׳');
  });

  it('falls back to "recently" for an unparseable timestamp', () => {
    expect(formatTimeAgo('garbage', now, false)).toBe('recently');
    expect(formatTimeAgo('garbage', now, true)).toBe('לאחרונה');
  });
});
