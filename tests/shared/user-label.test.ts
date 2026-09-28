import { describe, it, expect } from 'bun:test';
import { normalizeUserLabel } from '../../src/shared/user-label.js';

describe('normalizeUserLabel', () => {
  it('uppercases a lowercase label', () => {
    expect(normalizeUserLabel('chenzhu')).toBe('CHENZHU');
  });

  it('uppercases a mixed-case label', () => {
    expect(normalizeUserLabel('ChenZhu')).toBe('CHENZHU');
  });

  it('is idempotent on already-uppercase input', () => {
    expect(normalizeUserLabel('CHENZHU')).toBe('CHENZHU');
  });

  it('trims surrounding whitespace before uppercasing', () => {
    expect(normalizeUserLabel('  chenzhu ')).toBe('CHENZHU');
  });

  it('collapses to "UNKNOWN" for empty/whitespace-only input', () => {
    expect(normalizeUserLabel('')).toBe('UNKNOWN');
    expect(normalizeUserLabel('   ')).toBe('UNKNOWN');
  });

  it('preserves characters that are case-insensitive (digits, dots, dashes)', () => {
    expect(normalizeUserLabel('john.doe-1')).toBe('JOHN.DOE-1');
  });
});
