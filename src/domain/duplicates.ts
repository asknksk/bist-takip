import { ParsedImportTransaction } from './importParser';

interface ComparableTransaction {
  symbol: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  date: string;
  time: string;
}

const TIME_TOLERANCE_MINUTES = 5;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Returns the indices of `parsed` rows that are considered duplicates of an
 * existing transaction: same symbol (case-insensitive), type, quantity,
 * price and date, with times within ±5 minutes.
 */
export function findDuplicateTransactions(
  parsed: ParsedImportTransaction[],
  existing: ComparableTransaction[]
): number[] {
  const duplicates: number[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    const isDup = existing.some((e) => {
      if (e.symbol.toUpperCase() !== row.symbol.toUpperCase()) return false;
      if (e.type !== row.type) return false;
      if (e.quantity !== row.quantity) return false;
      if (e.price !== row.price) return false;
      if (e.date !== row.date) return false;
      const diff = Math.abs(timeToMinutes(e.time) - timeToMinutes(row.time));
      return diff <= TIME_TOLERANCE_MINUTES;
    });
    if (isDup) duplicates.push(i);
  }
  return duplicates;
}
