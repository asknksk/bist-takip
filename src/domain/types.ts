export type TransactionType = 'buy' | 'sell';

export interface Stock {
  id: number;
  symbol: string;
  name: string;
  isCustom: boolean;
}

export interface Transaction {
  id: number;
  stockId: number;
  type: TransactionType;
  quantity: number;
  price: number;
  date: string; // ISO date string, e.g. "2026-09-09"
}

export interface PortfolioRow {
  stockId: number;
  symbol: string;
  name: string;
  boughtQuantity: number;
  soldQuantity: number;
  heldQuantity: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  realizedPnL: number;
}

export interface CumulativePnLPoint {
  date: string;
  cumulativePnL: number;
}

export interface DailyPnL {
  date: string;
  realizedPnL: number;
}
