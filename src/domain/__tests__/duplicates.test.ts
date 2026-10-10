import { findDuplicateTransactions } from '../duplicates';
import { ParsedImportTransaction } from '../importParser';

function tx(overrides: Partial<ParsedImportTransaction>): ParsedImportTransaction {
  return {
    date: '2026-09-10',
    time: '11:42',
    type: 'buy',
    symbol: 'AKBNK',
    quantity: 18,
    price: 73.15,
    ...overrides,
  };
}

describe('findDuplicateTransactions', () => {
  it('returns no duplicates when there are no existing transactions', () => {
    const parsed = [tx({})];
    expect(findDuplicateTransactions(parsed, [])).toEqual([]);
  });

  it('marks an exact match (symbol, type, quantity, price, date, time) as duplicate', () => {
    const parsed = [tx({}), tx({ symbol: 'TUPRS', price: 90 })];
    const existing = [tx({})];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([0]);
  });

  it('marks a match within +5 minutes as duplicate', () => {
    const parsed = [tx({ time: '11:47' })];
    const existing = [tx({ time: '11:42' })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([0]);
  });

  it('marks a match within -5 minutes as duplicate', () => {
    const parsed = [tx({ time: '11:37' })];
    const existing = [tx({ time: '11:42' })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([0]);
  });

  it('does not mark a match with more than 5 minutes difference', () => {
    const parsed = [tx({ time: '11:48' })];
    const existing = [tx({ time: '11:42' })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([]);
  });

  it('does not mark as duplicate when price differs', () => {
    const parsed = [tx({ price: 73.2 })];
    const existing = [tx({ price: 73.15 })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([]);
  });

  it('does not mark as duplicate when date differs', () => {
    const parsed = [tx({ date: '2026-09-11' })];
    const existing = [tx({ date: '2026-09-10' })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([]);
  });

  it('does not mark as duplicate when symbol differs', () => {
    const parsed = [tx({ symbol: 'THYAO' })];
    const existing = [tx({ symbol: 'AKBNK' })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([]);
  });

  it('does not mark as duplicate when type differs', () => {
    const parsed = [tx({ type: 'sell' })];
    const existing = [tx({ type: 'buy' })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([]);
  });

  it('does not mark as duplicate when quantity differs', () => {
    const parsed = [tx({ quantity: 19 })];
    const existing = [tx({ quantity: 18 })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([]);
  });

  it('matches existing transactions case-insensitively by symbol', () => {
    const parsed = [tx({ symbol: 'akbnk' })];
    const existing = [tx({ symbol: 'AKBNK' })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([0]);
  });

  it('returns indices of all duplicates', () => {
    const parsed = [
      tx({}), // dup
      tx({ symbol: 'TUPRS' }), // new
      tx({ date: '2026-10-01', time: '09:35' }), // dup
    ];
    const existing = [tx({}), tx({ date: '2026-10-01', time: '09:30' })];
    expect(findDuplicateTransactions(parsed, existing)).toEqual([0, 2]);
  });
});
