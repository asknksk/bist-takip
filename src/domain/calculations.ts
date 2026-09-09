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

export function calculatePortfolioRow(stock: Stock, transactions: Transaction[]): PortfolioRow {
  const stockTxs = transactions.filter((t) => t.stockId === stock.id);
  const buys = stockTxs.filter((t) => t.type === 'buy');
  const sells = stockTxs.filter((t) => t.type === 'sell');

  const boughtQuantity = sum(buys.map((t) => t.quantity));
  const soldQuantity = sum(sells.map((t) => t.quantity));
  const totalBuyCost = sum(buys.map((t) => t.quantity * t.price));
  const totalSellRevenue = sum(sells.map((t) => t.quantity * t.price));

  const avgBuyPrice = boughtQuantity > 0 ? totalBuyCost / boughtQuantity : 0;
  const avgSellPrice = soldQuantity > 0 ? totalSellRevenue / soldQuantity : 0;
  const realizedPnL = soldQuantity > 0 ? soldQuantity * (avgSellPrice - avgBuyPrice) : 0;

  return {
    stockId: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    boughtQuantity,
    soldQuantity,
    heldQuantity: boughtQuantity - soldQuantity,
    avgBuyPrice,
    avgSellPrice,
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
  const avgBuyPriceByStock = new Map<number, number>();
  for (const stock of stocks) {
    avgBuyPriceByStock.set(stock.id, calculatePortfolioRow(stock, transactions).avgBuyPrice);
  }

  const sells = transactions
    .filter((t) => t.type === 'sell')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  let cumulative = 0;
  return sells.map((t) => {
    const avgBuyPrice = avgBuyPriceByStock.get(t.stockId) ?? 0;
    cumulative += t.quantity * (t.price - avgBuyPrice);
    return { date: t.date, cumulativePnL: cumulative };
  });
}

export function calculateDailyRealizedPnL(stocks: Stock[], transactions: Transaction[]): DailyPnL[] {
  const avgBuyPriceByStock = new Map<number, number>();
  for (const stock of stocks) {
    avgBuyPriceByStock.set(stock.id, calculatePortfolioRow(stock, transactions).avgBuyPrice);
  }

  const pnlByDate = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'sell') continue;
    const avgBuyPrice = avgBuyPriceByStock.get(t.stockId) ?? 0;
    const pnl = t.quantity * (t.price - avgBuyPrice);
    pnlByDate.set(t.date, (pnlByDate.get(t.date) ?? 0) + pnl);
  }

  return Array.from(pnlByDate.entries())
    .map(([date, realizedPnL]) => ({ date, realizedPnL }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function calculateMonthlyRealizedPnL(stocks: Stock[], transactions: Transaction[]): MonthlyPnL[] {
  const avgBuyPriceByStock = new Map<number, number>();
  for (const stock of stocks) {
    avgBuyPriceByStock.set(stock.id, calculatePortfolioRow(stock, transactions).avgBuyPrice);
  }

  const pnlByMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'sell') continue;
    const avgBuyPrice = avgBuyPriceByStock.get(t.stockId) ?? 0;
    const pnl = t.quantity * (t.price - avgBuyPrice);
    const month = t.date.slice(0, 7);
    pnlByMonth.set(month, (pnlByMonth.get(month) ?? 0) + pnl);
  }

  return Array.from(pnlByMonth.entries())
    .map(([month, realizedPnL]) => ({ month, realizedPnL }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Realized P&L per stock, counting only sell transactions whose date falls
 * within [fromIso, toIso] (both inclusive, ISO YYYY-MM-DD strings compare
 * lexicographically). Pass '' for fromIso or a far-future date for toIso to
 * leave that side of the range open. Uses each stock's overall average buy
 * price, consistent with calculateDailyRealizedPnL/calculateMonthlyRealizedPnL.
 */
export function calculateRealizedPnLByStockInRange(
  stocks: Stock[],
  transactions: Transaction[],
  fromIso: string,
  toIso: string
): StockPnLInRange[] {
  const avgBuyPriceByStock = new Map<number, number>();
  for (const stock of stocks) {
    avgBuyPriceByStock.set(stock.id, calculatePortfolioRow(stock, transactions).avgBuyPrice);
  }

  const pnlByStock = new Map<number, number>();
  for (const t of transactions) {
    if (t.type !== 'sell') continue;
    if (t.date < fromIso || t.date > toIso) continue;
    const avgBuyPrice = avgBuyPriceByStock.get(t.stockId) ?? 0;
    const pnl = t.quantity * (t.price - avgBuyPrice);
    pnlByStock.set(t.stockId, (pnlByStock.get(t.stockId) ?? 0) + pnl);
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
