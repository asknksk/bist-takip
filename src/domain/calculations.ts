import {
  CumulativePnLPoint,
  DailyPnL,
  MonthlyPnL,
  PortfolioRow,
  Stock,
  StockPnLInRange,
  Transaction,
} from './types';

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function sortChronologically(transactions: Transaction[]): Transaction[] {
  return transactions
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id - b.id
    );
}

export interface SellPnL {
  transactionId: number;
  stockId: number;
  date: string;
  quantity: number;
  realizedPnL: number;
}

/**
 * Walks each stock's transactions in chronological order, maintaining a
 * moving (weighted) average cost that updates on every buy and is left
 * unchanged by sells — the standard "moving average cost" method. This is
 * the ONLY correct way to compute realized P&L once a stock has more than
 * one buy/sell round trip: averaging every buy ever made (regardless of
 * whether those shares were already sold in an earlier round trip) blends
 * unrelated price levels together and produces a meaningless "average
 * cost" and incorrect per-transaction/per-period P&L, even though the
 * all-time grand total happens to cancel out correctly when the position
 * ends up fully closed. Every other function in this module is built on
 * top of this one so they all agree with each other.
 */
export function calculateSellPnLs(stocks: Stock[], transactions: Transaction[]): SellPnL[] {
  const results: SellPnL[] = [];

  for (const stock of stocks) {
    const stockTxs = sortChronologically(transactions.filter((t) => t.stockId === stock.id));

    let runningQty = 0;
    let runningAvgCost = 0;

    for (const t of stockTxs) {
      if (t.type === 'buy') {
        const newQty = runningQty + t.quantity;
        runningAvgCost = newQty > 0 ? (runningQty * runningAvgCost + t.quantity * t.price) / newQty : 0;
        runningQty = newQty;
      } else {
        results.push({
          transactionId: t.id,
          stockId: t.stockId,
          date: t.date,
          quantity: t.quantity,
          realizedPnL: t.quantity * (t.price - runningAvgCost),
        });
        runningQty -= t.quantity;
        if (runningQty <= 0) {
          runningQty = 0;
          runningAvgCost = 0;
        }
      }
    }
  }

  return results;
}

export function calculatePortfolioRow(stock: Stock, transactions: Transaction[]): PortfolioRow {
  const stockTxs = sortChronologically(transactions.filter((t) => t.stockId === stock.id));

  let runningQty = 0;
  let runningAvgCost = 0;
  let boughtQuantity = 0;
  let soldQuantity = 0;
  let totalSellRevenue = 0;
  let realizedPnL = 0;

  for (const t of stockTxs) {
    if (t.type === 'buy') {
      boughtQuantity += t.quantity;
      const newQty = runningQty + t.quantity;
      runningAvgCost = newQty > 0 ? (runningQty * runningAvgCost + t.quantity * t.price) / newQty : 0;
      runningQty = newQty;
    } else {
      soldQuantity += t.quantity;
      totalSellRevenue += t.quantity * t.price;
      realizedPnL += t.quantity * (t.price - runningAvgCost);
      runningQty -= t.quantity;
      if (runningQty <= 0) {
        runningQty = 0;
        runningAvgCost = 0;
      }
    }
  }

  return {
    stockId: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    boughtQuantity,
    soldQuantity,
    heldQuantity: runningQty,
    // Current cost basis of the shares still held — 0 when nothing is held,
    // never a blend with lots from an already-closed earlier round trip.
    avgBuyPrice: runningAvgCost,
    avgSellPrice: soldQuantity > 0 ? totalSellRevenue / soldQuantity : 0,
    realizedPnL,
  };
}

export function calculatePortfolio(stocks: Stock[], transactions: Transaction[]): PortfolioRow[] {
  return stocks
    .map((s) => calculatePortfolioRow(s, transactions))
    .filter((row) => row.boughtQuantity > 0 || row.soldQuantity > 0);
}

export function calculateTotalRealizedPnL(rows: PortfolioRow[]): number {
  return sum(rows.map((r) => r.realizedPnL));
}

export function validateSellQuantity(heldQuantity: number, sellQuantity: number): boolean {
  return sellQuantity <= heldQuantity;
}

export function calculateCumulativePnLOverTime(
  stocks: Stock[],
  transactions: Transaction[]
): CumulativePnLPoint[] {
  const sellPnLs = calculateSellPnLs(stocks, transactions).sort(
    (a, b) => a.date.localeCompare(b.date) || a.transactionId - b.transactionId
  );

  let cumulative = 0;
  return sellPnLs.map((s) => {
    cumulative += s.realizedPnL;
    return { date: s.date, cumulativePnL: cumulative };
  });
}

export function calculateDailyRealizedPnL(stocks: Stock[], transactions: Transaction[]): DailyPnL[] {
  const pnlByDate = new Map<string, number>();
  for (const s of calculateSellPnLs(stocks, transactions)) {
    pnlByDate.set(s.date, (pnlByDate.get(s.date) ?? 0) + s.realizedPnL);
  }

  return Array.from(pnlByDate.entries())
    .map(([date, realizedPnL]) => ({ date, realizedPnL }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function calculateMonthlyRealizedPnL(stocks: Stock[], transactions: Transaction[]): MonthlyPnL[] {
  const pnlByMonth = new Map<string, number>();
  for (const s of calculateSellPnLs(stocks, transactions)) {
    const month = s.date.slice(0, 7);
    pnlByMonth.set(month, (pnlByMonth.get(month) ?? 0) + s.realizedPnL);
  }

  return Array.from(pnlByMonth.entries())
    .map(([month, realizedPnL]) => ({ month, realizedPnL }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Realized P&L per stock, counting only sell transactions whose date falls
 * within [fromIso, toIso] (both inclusive, ISO YYYY-MM-DD strings compare
 * lexicographically). Pass '' for fromIso or a far-future date for toIso to
 * leave that side of the range open. Built on the same moving-average-cost
 * per-sell P&L as calculateDailyRealizedPnL/calculateMonthlyRealizedPnL.
 */
export function calculateRealizedPnLByStockInRange(
  stocks: Stock[],
  transactions: Transaction[],
  fromIso: string,
  toIso: string
): StockPnLInRange[] {
  const pnlByStock = new Map<number, number>();
  for (const s of calculateSellPnLs(stocks, transactions)) {
    if (s.date < fromIso || s.date > toIso) continue;
    pnlByStock.set(s.stockId, (pnlByStock.get(s.stockId) ?? 0) + s.realizedPnL);
  }

  const stockById = new Map(stocks.map((s) => [s.id, s]));
  return Array.from(pnlByStock.entries())
    .map(([stockId, realizedPnL]) => {
      const s = stockById.get(stockId);
      return {
        stockId,
        symbol: s?.symbol ?? '',
        name: s?.name ?? '',
        realizedPnL,
      };
    })
    .sort((a, b) => Math.abs(b.realizedPnL) - Math.abs(a.realizedPnL));
}
