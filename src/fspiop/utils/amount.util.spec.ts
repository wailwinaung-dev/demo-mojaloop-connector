import { describe, expect, it } from 'vitest';
import { formatMojaloopAmount } from './amount.util.js';

describe('formatMojaloopAmount', () => {
  it('should trim trailing zeros from decimal amounts', () => {
    expect(formatMojaloopAmount('100.00')).toBe('100');
    expect(formatMojaloopAmount('100.50')).toBe('100.5');
    expect(formatMojaloopAmount('100.5000')).toBe('100.5');
    expect(formatMojaloopAmount('0.50')).toBe('0.5');
    expect(formatMojaloopAmount('0.00')).toBe('0');
  });

  it('should keep significant decimal digits intact', () => {
    expect(formatMojaloopAmount('100.25')).toBe('100.25');
    expect(formatMojaloopAmount('100.1234')).toBe('100.1234');
    expect(formatMojaloopAmount('0.05')).toBe('0.05');
  });

  it('should leave integer strings unmodified', () => {
    expect(formatMojaloopAmount('100')).toBe('100');
    expect(formatMojaloopAmount('0')).toBe('0');
    expect(formatMojaloopAmount('5000')).toBe('5000');
  });

  it('should handle numeric input types gracefully', () => {
    expect(formatMojaloopAmount(100)).toBe('100');
    expect(formatMojaloopAmount(100.5)).toBe('100.5');
  });
});
