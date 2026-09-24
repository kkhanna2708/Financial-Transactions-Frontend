import { describe, it, expect } from 'vitest';
import { formatMoney } from '../../lib/money.js';

describe('T-1 lib/money.js formatMoney (string-only, no float arithmetic)', () => {
  it('groups thousands, pads/truncates to 2 decimals, and never rounds', () => {
    expect(formatMoney('1234.5')).toBe('1,234.50');
    expect(formatMoney('1000000')).toBe('1,000,000.00');
    expect(formatMoney('0.999')).toBe('0.99'); // truncate, not round to 1.00
    expect(formatMoney('-42.1')).toBe('-42.10');
  });

  it('returns non-numeric-looking input unchanged instead of throwing', () => {
    expect(formatMoney('not-a-number')).toBe('not-a-number');
    expect(formatMoney(undefined)).toBe(undefined);
  });
});
