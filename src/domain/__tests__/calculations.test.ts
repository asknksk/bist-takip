import {
  calculatePortfolioRow,
  calculatePortfolio,
  calculateTotalRealizedPnL,
  validateSellQuantity,
  calculateCumulativePnLOverTime,
  calculateDailyRealizedPnL,
  calculateMonthlyRealizedPnL,
  calculateRealizedPnLByStockInRange,
  calculateSellPnLs,
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

  test('a fully closed round trip resets avgBuyPrice to 0 (no current holding), not a blended average', () => {
    // Regression test: averaging ALL buys ever (including already-sold lots)
    // instead of tracking a moving average produced a nonsensical
    // "average cost" once a stock had been fully bought and sold before.
    const txs: Transaction[] = [
      tx({ id: 1, type: 'buy', quantity: 128, price: 370.75, date: '2026-08-18' }),
      tx({ id: 2, type: 'sell', quantity: 128, price: 395.0, date: '2026-08-20' }),
    ];
    const row = calculatePortfolioRow(stock, txs);
    expect(row.heldQuantity).toBe(0);
    expect(row.avgBuyPrice).toBe(0);
    expect(row.realizedPnL).toBeCloseTo(128 * (395.0 - 370.75), 5);
  });

  test('multiple buy/sell round trips: total realized P&L is the sum of each trip\'s own profit, not a blended-average result', () => {
    // Same shape as a real user's TUPRS history: buy N, sell N, at a
    // different price each round trip.
    const txs: Transaction[] = [
      tx({ id: 1, type: 'buy', quantity: 128, price: 370.75, date: '2026-08-18' }),
      tx({ id: 2, type: 'sell', quantity: 128, price: 395.0, date: '2026-08-20' }),
      tx({ id: 3, type: 'buy', quantity: 61, price: 400.5, date: '2026-08-21' }),
      tx({ id: 4, type: 'sell', quantity: 61, price: 401.25, date: '2026-08-24' }),
      tx({ id: 5, type: 'buy', quantity: 74, price: 399.5, date: '2026-08-31' }),
      tx({ id: 6, type: 'sell', quantity: 74, price: 415.0, date: '2026-09-01' }),
      tx({ id: 7, type: 'buy', quantity: 102, price: 390.75, date: '2026-09-08' }),
      tx({ id: 8, type: 'sell', quantity: 102, price: 404.5, date: '2026-09-09' }),
    ];
    const expectedTotal =
      128 * (395.0 - 370.75) + 61 * (401.25 - 400.5) + 74 * (415.0 - 399.5) + 102 * (404.5 - 390.75);
    const row = calculatePortfolioRow(stock, txs);
    expect(row.heldQuantity).toBe(0);
    expect(row.avgBuyPrice).toBe(0);
    expect(row.realizedPnL).toBeCloseTo(expectedTotal, 5);
  });

  test('a new round trip after a full sell-out uses only the new lot\'s cost, not blended with the old one', () => {
    const txs: Transaction[] = [
      tx({ id: 1, type: 'buy', quantity: 100, price: 10, date: '2026-01-01' }),
      tx({ id: 2, type: 'sell', quantity: 100, price: 12, date: '2026-01-05' }),
      tx({ id: 3, type: 'buy', quantity: 50, price: 20, date: '2026-02-01' }),
    ];
    const row = calculatePortfolioRow(stock, txs);
    expect(row.heldQuantity).toBe(50);
    // Must be 20 (the new lot's price), not (100*10 + 50*20) / 150 = 13.33.
    expect(row.avgBuyPrice).toBe(20);
    expect(row.realizedPnL).toBeCloseTo(100 * (12 - 10), 5);
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

  test('attributes each round trip\'s own P&L to its own day, not a blended-average result', () => {
    // Regression: using one blended all-time average buy price for every
    // sell would smear each round trip's real profit across the wrong days.
    const txs: Transaction[] = [
      tx({ id: 1, type: 'buy', quantity: 128, price: 370.75, date: '2026-08-18' }),
      tx({ id: 2, type: 'sell', quantity: 128, price: 395.0, date: '2026-08-20' }),
      tx({ id: 3, type: 'buy', quantity: 61, price: 400.5, date: '2026-08-21' }),
      tx({ id: 4, type: 'sell', quantity: 61, price: 401.25, date: '2026-08-24' }),
    ];
    const daily = calculateDailyRealizedPnL([stock], txs);
    expect(daily).toEqual([
      { date: '2026-08-24', realizedPnL: 61 * (401.25 - 400.5) },
      { date: '2026-08-20', realizedPnL: 128 * (395.0 - 370.75) },
    ]);
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

describe('calculateRealizedPnLByStockInRange', () => {
  test('only counts sells whose date falls within [from, to], using each stock overall avg buy price', () => {
    const txs: Transaction[] = [
      tx({ id: 1, stockId: stock.id, type: 'buy', quantity: 10, price: 100, date: '2026-01-01' }),
      tx({ id: 2, stockId: stock.id, type: 'sell', quantity: 5, price: 150, date: '2026-02-10' }),
      tx({ id: 3, stockId: stock.id, type: 'sell', quantity: 5, price: 130, date: '2026-05-01' }),
      tx({ id: 4, stockId: stock2.id, type: 'buy', quantity: 20, price: 10, date: '2026-01-15' }),
      tx({ id: 5, stockId: stock2.id, type: 'sell', quantity: 10, price: 8, date: '2026-02-20' }),
    ];
    // Range covers only February: only tx 2 and 5 count.
    const result = calculateRealizedPnLByStockInRange([stock, stock2], txs, '2026-02-01', '2026-02-28');
    expect(result).toEqual(
      expect.arrayContaining([
        { stockId: stock.id, symbol: 'THYAO', name: 'Türk Hava Yolları', realizedPnL: 250 },
        { stockId: stock2.id, symbol: 'ASELS', name: 'Aselsan', realizedPnL: -20 },
      ])
    );
    expect(result).toHaveLength(2);
  });

  test('excludes stocks with no sells in range even if they have sells outside it', () => {
    const txs: Transaction[] = [
      tx({ id: 1, stockId: stock.id, type: 'buy', quantity: 10, price: 100, date: '2026-01-01' }),
      tx({ id: 2, stockId: stock.id, type: 'sell', quantity: 5, price: 150, date: '2026-06-01' }),
    ];
    const result = calculateRealizedPnLByStockInRange([stock], txs, '2026-01-01', '2026-02-01');
    expect(result).toEqual([]);
  });

  test('an open-ended range (empty from/to) behaves like no lower/upper bound', () => {
    const txs: Transaction[] = [
      tx({ id: 1, stockId: stock.id, type: 'buy', quantity: 10, price: 100, date: '2026-01-01' }),
      tx({ id: 2, stockId: stock.id, type: 'sell', quantity: 5, price: 150, date: '2026-06-01' }),
    ];
    const result = calculateRealizedPnLByStockInRange([stock], txs, '', '9999-12-31');
    expect(result).toEqual([
      { stockId: stock.id, symbol: 'THYAO', name: 'Türk Hava Yolları', realizedPnL: 250 },
    ]);
  });
});

describe('calculateSellPnLs', () => {
  test('computes one entry per sell transaction using the moving average cost at that point in time', () => {
    const txs: Transaction[] = [
      tx({ id: 1, type: 'buy', quantity: 100, price: 10, date: '2026-01-01' }),
      tx({ id: 2, type: 'sell', quantity: 100, price: 12, date: '2026-01-05' }),
      tx({ id: 3, type: 'buy', quantity: 50, price: 20, date: '2026-02-01' }),
      tx({ id: 4, type: 'sell', quantity: 20, price: 25, date: '2026-02-10' }),
    ];
    const result = calculateSellPnLs([stock], txs);
    expect(result).toEqual([
      { transactionId: 2, stockId: stock.id, date: '2026-01-05', quantity: 100, realizedPnL: 200 },
      { transactionId: 4, stockId: stock.id, date: '2026-02-10', quantity: 20, realizedPnL: 100 },
    ]);
  });
});
