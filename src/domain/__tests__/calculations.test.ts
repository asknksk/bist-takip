import {
  calculatePortfolioRow,
  calculatePortfolio,
  calculateTotalRealizedPnL,
  validateSellQuantity,
  calculateCumulativePnLOverTime,
  calculateDailyRealizedPnL,
  calculateMonthlyRealizedPnL,
} from '../calculations';
import { Stock, Transaction } from '../types';

const stock: Stock = { id: 1, symbol: 'THYAO', name: 'Türk Hava Yolları', isCustom: false };
const stock2: Stock = { id: 2, symbol: 'ASELS', name: 'Aselsan', isCustom: false };

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? 1,
    stockId: overrides.stockId ?? stock.id,
    type: overrides.type ?? 'buy',
    quantity: overrides.quantity ?? 10,
    price: overrides.price ?? 100,
    date: overrides.date ?? '2026-01-01',
  };
}

describe('calculatePortfolioRow', () => {
  test('computes weighted average buy price across multiple buys', () => {
    const txs = [
      tx({ id: 1, type: 'buy', quantity: 10, price: 100 }),
      tx({ id: 2, type: 'buy', quantity: 10, price: 200 }),
    ];
    const row = calculatePortfolioRow(stock, txs);
    expect(row.boughtQuantity).toBe(20);
    expect(row.avgBuyPrice).toBe(150);
    expect(row.heldQuantity).toBe(20);
    expect(row.realizedPnL).toBe(0);
  });

  test('computes realized P&L on a partial sell using average buy price', () => {
    const txs = [
      tx({ id: 1, type: 'buy', quantity: 10, price: 100 }),
      tx({ id: 2, type: 'buy', quantity: 10, price: 200 }),
      tx({ id: 3, type: 'sell', quantity: 5, price: 250 }),
    ];
    const row = calculatePortfolioRow(stock, txs);
    // avg buy price = 150, sold 5 @ 250 => realized pnl = 5 * (250 - 150) = 500
    expect(row.avgBuyPrice).toBe(150);
    expect(row.soldQuantity).toBe(5);
    expect(row.avgSellPrice).toBe(250);
    expect(row.realizedPnL).toBe(500);
    expect(row.heldQuantity).toBe(15);
  });

  test('returns zeros when there are no transactions for the stock', () => {
    const row = calculatePortfolioRow(stock, []);
    expect(row).toEqual({
      stockId: 1,
      symbol: 'THYAO',
      name: 'Türk Hava Yolları',
      boughtQuantity: 0,
      soldQuantity: 0,
      heldQuantity: 0,
      avgBuyPrice: 0,
      avgSellPrice: 0,
      realizedPnL: 0,
    });
  });

  test('ignores transactions belonging to other stocks', () => {
    const txs = [tx({ stockId: stock2.id, type: 'buy', quantity: 100, price: 5 })];
    const row = calculatePortfolioRow(stock, txs);
    expect(row.boughtQuantity).toBe(0);
  });
});

describe('calculatePortfolio', () => {
  test('returns one row per stock with activity, skipping untouched stocks', () => {
    const untouched: Stock = { id: 3, symbol: 'GARAN', name: 'Garanti BBVA', isCustom: false };
    const txs = [tx({ stockId: stock.id, type: 'buy', quantity: 10, price: 100 })];
    const rows = calculatePortfolio([stock, stock2, untouched], txs);
    expect(rows.map((r) => r.stockId)).toEqual([1]);
  });
});

describe('calculateTotalRealizedPnL', () => {
  test('sums realized P&L across rows', () => {
    const rows = [
      { ...calculatePortfolioRow(stock, []), realizedPnL: 500 },
      { ...calculatePortfolioRow(stock2, []), realizedPnL: -100 },
    ];
    expect(calculateTotalRealizedPnL(rows)).toBe(400);
  });
});

describe('validateSellQuantity', () => {
  test('allows selling up to the held quantity', () => {
    expect(validateSellQuantity(10, 10)).toBe(true);
  });

  test('rejects selling more than held', () => {
    expect(validateSellQuantity(10, 11)).toBe(false);
  });
});

describe('calculateCumulativePnLOverTime', () => {
  test('accumulates realized P&L in date order using each stock\'s overall average buy price', () => {
    const txs: Transaction[] = [
      tx({ id: 1, stockId: stock.id, type: 'buy', quantity: 10, price: 100, date: '2026-01-01' }),
      tx({ id: 2, stockId: stock.id, type: 'sell', quantity: 5, price: 150, date: '2026-02-01' }),
      tx({ id: 3, stockId: stock2.id, type: 'buy', quantity: 20, price: 10, date: '2026-01-15' }),
      tx({ id: 4, stockId: stock2.id, type: 'sell', quantity: 10, price: 8, date: '2026-03-01' }),
    ];
    const points = calculateCumulativePnLOverTime([stock, stock2], txs);
    // sell 1: 5 * (150 - 100) = 250 -> cumulative 250
    // sell 2: 10 * (8 - 10) = -20 -> cumulative 230
    expect(points).toEqual([
      { date: '2026-02-01', cumulativePnL: 250 },
      { date: '2026-03-01', cumulativePnL: 230 },
    ]);
  });

  test('returns an empty array when there are no sell transactions', () => {
    const txs = [tx({ type: 'buy' })];
    expect(calculateCumulativePnLOverTime([stock], txs)).toEqual([]);
  });
});

describe('calculateDailyRealizedPnL', () => {
  test('sums realized P&L per day across multiple stocks, sorted newest first', () => {
    const txs: Transaction[] = [
      tx({ id: 1, stockId: stock.id, type: 'buy', quantity: 10, price: 100, date: '2026-01-01' }),
      tx({ id: 2, stockId: stock.id, type: 'sell', quantity: 5, price: 150, date: '2026-02-01' }),
      tx({ id: 3, stockId: stock2.id, type: 'buy', quantity: 20, price: 10, date: '2026-01-15' }),
      tx({ id: 4, stockId: stock2.id, type: 'sell', quantity: 10, price: 8, date: '2026-02-01' }),
      tx({ id: 5, stockId: stock2.id, type: 'sell', quantity: 5, price: 20, date: '2026-03-01' }),
    ];
    const daily = calculateDailyRealizedPnL([stock, stock2], txs);
    // 2026-02-01: THYAO sell 5*(150-100)=250, ASELS sell 10*(8-10)=-20 => total 230
    // 2026-03-01: ASELS sell 5*(20-10)=50
    expect(daily).toEqual([
      { date: '2026-03-01', realizedPnL: 50 },
      { date: '2026-02-01', realizedPnL: 230 },
    ]);
  });

  test('returns an empty array when there are no sell transactions', () => {
    const txs = [tx({ type: 'buy' })];
    expect(calculateDailyRealizedPnL([stock], txs)).toEqual([]);
  });
});

describe('calculateMonthlyRealizedPnL', () => {
  test('sums realized P&L per calendar month across multiple stocks, sorted newest first', () => {
    const txs: Transaction[] = [
      tx({ id: 1, stockId: stock.id, type: 'buy', quantity: 10, price: 100, date: '2026-01-01' }),
      tx({ id: 2, stockId: stock.id, type: 'sell', quantity: 5, price: 150, date: '2026-02-10' }),
      tx({ id: 3, stockId: stock2.id, type: 'buy', quantity: 20, price: 10, date: '2026-01-15' }),
      tx({ id: 4, stockId: stock2.id, type: 'sell', quantity: 10, price: 8, date: '2026-02-20' }),
      tx({ id: 5, stockId: stock2.id, type: 'sell', quantity: 5, price: 20, date: '2026-03-01' }),
    ];
    const monthly = calculateMonthlyRealizedPnL([stock, stock2], txs);
    // 2026-02: THYAO sell 5*(150-100)=250, ASELS sell 10*(8-10)=-20 => total 230
    // 2026-03: ASELS sell 5*(20-10)=50
    expect(monthly).toEqual([
      { month: '2026-03', realizedPnL: 50 },
      { month: '2026-02', realizedPnL: 230 },
    ]);
  });

  test('returns an empty array when there are no sell transactions', () => {
    const txs = [tx({ type: 'buy' })];
    expect(calculateMonthlyRealizedPnL([stock], txs)).toEqual([]);
  });
});
