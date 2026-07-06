import { describe, it, expect } from 'vitest';
import { hasHebrew, getDirection } from './rtl';

describe('hasHebrew', () => {
  it('detects Hebrew characters', () => {
    expect(hasHebrew('שלום')).toBe(true);
    expect(hasHebrew('hello שלום')).toBe(true);
  });

  it('is false for non-Hebrew / empty', () => {
    expect(hasHebrew('hello world')).toBe(false);
    expect(hasHebrew('')).toBe(false);
    expect(hasHebrew('123 !@#')).toBe(false);
  });
});

describe('getDirection', () => {
  it('honors an explicit Hebrew language tag', () => {
    expect(getDirection('hello', 'he')).toBe('rtl');
  });

  it('infers RTL from Hebrew content', () => {
    expect(getDirection('שלום')).toBe('rtl');
  });

  it('defaults to LTR', () => {
    expect(getDirection('hello world')).toBe('ltr');
    expect(getDirection('hello', 'en')).toBe('ltr');
  });
});
