# BIST Hisse Kar/Zarar Takip Uygulaması Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Android app (Expo/React Native + TypeScript) where the user logs BIST buy/sell transactions and sees realized profit/loss per stock, a portfolio summary, and charts — data stored locally on device (SQLite), no backend.

**Architecture:** Expo managed React Native app. A pure, dependency-free `domain/calculations.ts` module holds all P&L math (unit-tested with Jest). A thin SQLite persistence layer (`db/`) stores stocks and transactions. Four screens (Add Transaction, Portfolio, Summary, History) sit behind a bottom-tab navigator and read/write through the repositories. A static seed file provides the initial BIST symbol/name list; users can add custom stocks from the app.

**Tech Stack:** Expo (TypeScript, managed workflow), `expo-sqlite`, `@react-navigation` (bottom tabs), `react-native-svg` + `react-native-chart-kit`, Jest + `ts-jest` for unit tests, EAS Build for APK generation.

**Spec:** [docs/superpowers/specs/2026-09-09-hisse-takip-app-design.md](../specs/2026-09-09-hisse-takip-app-design.md)

## Global Constraints

- Weighted-average cost method (not FIFO) — verbatim from spec's "Hesaplama Mantığı"
- Sell quantity cannot exceed currently held quantity — form must block this
- Quantity and price must be positive numbers — form must block zero/negative
- Data lives only on-device (SQLite via `expo-sqlite`) — no network calls, no backend
- No live stock price fetching anywhere in the app
- All user-facing text in the app is in Turkish

---

### Task 1: Scaffold Expo project + test tooling

**Files:**
- Create: Expo project root files (`app.json`, `App.tsx`, `package.json`, `tsconfig.json`, etc.) via `create-expo-app`
- Create: `jest.config.js`
- Modify: `package.json` (add `test` script, `jest`/`ts-jest`/`@types/jest` devDependencies)

**Interfaces:**
- Produces: a working `npx tsc --noEmit` and `npm test` command that later tasks rely on.

- [ ] **Step 1: Scaffold the Expo TypeScript app in the current directory**

```bash
npx create-expo-app@latest . --template blank-typescript
```

- [ ] **Step 2: Install Jest + ts-jest for unit testing pure TS modules**

```bash
npm install --save-dev jest ts-jest @types/jest
```

- [ ] **Step 3: Create `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};
```

- [ ] **Step 4: Add a `test` script to `package.json`**

Edit the `"scripts"` section of `package.json` to include:

```json
"test": "jest"
```

- [ ] **Step 5: Verify the toolchain works with a throwaway test**

Create `src/__tests__/sanity.test.ts`:

```ts
test('jest + ts-jest is working', () => {
  expect(1 + 1).toBe(2);
});
```

Run: `npm test`
Expected: PASS (1 test)

Delete `src/__tests__/sanity.test.ts` after confirming, since it carries no real coverage.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo TypeScript app with Jest test tooling"
```

---

### Task 2: Domain types and P&L calculation functions (TDD)

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/calculations.ts`
- Test: `src/domain/__tests__/calculations.test.ts`

**Interfaces:**
- Produces:
  - `Stock { id: number; symbol: string; name: string; isCustom: boolean }`
  - `Transaction { id: number; stockId: number; type: 'buy' | 'sell'; quantity: number; price: number; date: string }`
  - `PortfolioRow { stockId: number; symbol: string; name: string; boughtQuantity: number; soldQuantity: number; heldQuantity: number; avgBuyPrice: number; avgSellPrice: number; realizedPnL: number }`
  - `CumulativePnLPoint { date: string; cumulativePnL: number }`
  - `calculatePortfolioRow(stock: Stock, transactions: Transaction[]): PortfolioRow`
  - `calculatePortfolio(stocks: Stock[], transactions: Transaction[]): PortfolioRow[]`
  - `calculateTotalRealizedPnL(rows: PortfolioRow[]): number`
  - `validateSellQuantity(heldQuantity: number, sellQuantity: number): boolean`
  - `calculateCumulativePnLOverTime(stocks: Stock[], transactions: Transaction[]): CumulativePnLPoint[]`
- These are the exact names/signatures Tasks 4, 8, 9, 10 will import.

- [ ] **Step 1: Write `src/domain/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing tests for calculation logic**

Create `src/domain/__tests__/calculations.test.ts`:

```ts
import {
  calculatePortfolioRow,
  calculatePortfolio,
  calculateTotalRealizedPnL,
  validateSellQuantity,
  calculateCumulativePnLOverTime,
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- calculations`
Expected: FAIL with "Cannot find module '../calculations'"

- [ ] **Step 4: Implement `src/domain/calculations.ts`**

```ts
import { CumulativePnLPoint, PortfolioRow, Stock, Transaction } from './types';

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
  const realizedPnL = soldQuantity * (avgSellPrice - avgBuyPrice);

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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- calculations`
Expected: PASS (all tests in `calculations.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/domain
git commit -m "feat: add P&L calculation domain logic with unit tests"
```

---

### Task 3: BIST stock seed data

**Files:**
- Create: `src/data/bistStocks.ts`

**Interfaces:**
- Produces: `BIST_STOCKS: { symbol: string; name: string }[]` — consumed by Task 4's `seedStocksIfEmpty`.

- [ ] **Step 1: Create the static seed list**

Create `src/data/bistStocks.ts` with a general, well-known BIST symbol/name list (user approved a general list; not scraped live, and users can add more from within the app):

```ts
export interface BistStockSeed {
  symbol: string;
  name: string;
}

export const BIST_STOCKS: BistStockSeed[] = [
  { symbol: 'THYAO', name: 'Türk Hava Yolları' },
  { symbol: 'ASELS', name: 'Aselsan' },
  { symbol: 'GARAN', name: 'Garanti BBVA' },
  { symbol: 'AKBNK', name: 'Akbank' },
  { symbol: 'ISCTR', name: 'İş Bankası (C)' },
  { symbol: 'YKBNK', name: 'Yapı Kredi Bankası' },
  { symbol: 'VAKBN', name: 'VakıfBank' },
  { symbol: 'HALKB', name: 'Halkbank' },
  { symbol: 'SISE', name: 'Şişecam' },
  { symbol: 'KCHOL', name: 'Koç Holding' },
  { symbol: 'SAHOL', name: 'Sabancı Holding' },
  { symbol: 'EREGL', name: 'Ereğli Demir Çelik' },
  { symbol: 'TUPRS', name: 'Tüpraş' },
  { symbol: 'BIMAS', name: 'BİM Mağazalar' },
  { symbol: 'MGROS', name: 'Migros' },
  { symbol: 'TCELL', name: 'Turkcell' },
  { symbol: 'TTKOM', name: 'Türk Telekom' },
  { symbol: 'PGSUS', name: 'Pegasus' },
  { symbol: 'FROTO', name: 'Ford Otosan' },
  { symbol: 'TOASO', name: 'Tofaş Oto Fabrika' },
  { symbol: 'DOAS', name: 'Doğuş Otomotiv' },
  { symbol: 'OTKAR', name: 'Otokar' },
  { symbol: 'ARCLK', name: 'Arçelik' },
  { symbol: 'VESTL', name: 'Vestel' },
  { symbol: 'KOZAL', name: 'Koza Altın' },
  { symbol: 'KOZAA', name: 'Koza Madencilik' },
  { symbol: 'PETKM', name: 'Petkim' },
  { symbol: 'TAVHL', name: 'TAV Havalimanları' },
  { symbol: 'ENKAI', name: 'Enka İnşaat' },
  { symbol: 'GUBRF', name: 'Gübre Fabrikaları' },
  { symbol: 'ALARK', name: 'Alarko Holding' },
  { symbol: 'AEFES', name: 'Anadolu Efes' },
  { symbol: 'CCOLA', name: 'Coca-Cola İçecek' },
  { symbol: 'ULKER', name: 'Ülker Bisküvi' },
  { symbol: 'SASA', name: 'Sasa Polyester' },
  { symbol: 'KRDMD', name: 'Kardemir (D)' },
  { symbol: 'EKGYO', name: 'Emlak Konut GYO' },
  { symbol: 'ISGYO', name: 'İş GYO' },
  { symbol: 'TSKB', name: 'TSKB' },
  { symbol: 'SOKM', name: 'Şok Marketler' },
  { symbol: 'MAVI', name: 'Mavi Giyim' },
  { symbol: 'LOGO', name: 'Logo Yazılım' },
  { symbol: 'NETAS', name: 'Netaş Telekomünikasyon' },
  { symbol: 'ASTOR', name: 'Astor Enerji' },
  { symbol: 'ENJSA', name: 'Enerjisa Enerji' },
  { symbol: 'AKSEN', name: 'Aksa Enerji' },
  { symbol: 'ZOREN', name: 'Zorlu Enerji' },
  { symbol: 'ISMEN', name: 'İş Yatırım Menkul Değerler' },
  { symbol: 'KONTR', name: 'Kontrolmatik Teknoloji' },
  { symbol: 'CIMSA', name: 'Çimsa' },
  { symbol: 'OYAKC', name: 'Oyak Çimento' },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/data/bistStocks.ts
git commit -m "feat: add static BIST stock seed list"
```

---

### Task 4: SQLite database and repositories

**Files:**
- Create: `src/db/database.ts`
- Create: `src/db/stocksRepo.ts`
- Create: `src/db/transactionsRepo.ts`

**Interfaces:**
- Consumes: `Stock`, `Transaction`, `TransactionType` from `src/domain/types.ts` (Task 2); `BIST_STOCKS` from `src/data/bistStocks.ts` (Task 3).
- Produces:
  - `getDatabase(): Promise<SQLite.SQLiteDatabase>`
  - `seedStocksIfEmpty(): Promise<void>`
  - `getAllStocks(): Promise<Stock[]>`
  - `addCustomStock(symbol: string, name: string): Promise<void>`
  - `deleteStock(id: number): Promise<void>`
  - `addTransaction(stockId: number, type: TransactionType, quantity: number, price: number, date: string): Promise<void>`
  - `getAllTransactions(): Promise<Transaction[]>`
  - `deleteTransaction(id: number): Promise<void>`
  - These are what Tasks 7, 8, 9, 10 import to read/write data.

This layer wraps a native SQLite module, so it is verified by running the app (Task 5 onward) rather than by Jest unit tests — `expo-sqlite` requires a real native runtime.

- [ ] **Step 1: Install `expo-sqlite`**

```bash
npx expo install expo-sqlite
```

- [ ] **Step 2: Create `src/db/database.ts`**

```ts
import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('hisse_takip.db').then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS stocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          is_custom INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_id INTEGER NOT NULL REFERENCES stocks(id),
          type TEXT NOT NULL CHECK (type IN ('buy','sell')),
          quantity REAL NOT NULL,
          price REAL NOT NULL,
          date TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}
```

- [ ] **Step 3: Create `src/db/stocksRepo.ts`**

```ts
import { getDatabase } from './database';
import { Stock } from '../domain/types';
import { BIST_STOCKS } from '../data/bistStocks';

export async function seedStocksIfEmpty(): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM stocks');
  if (row && row.count > 0) return;
  for (const s of BIST_STOCKS) {
    await db.runAsync(
      'INSERT OR IGNORE INTO stocks (symbol, name, is_custom) VALUES (?, ?, 0)',
      s.symbol,
      s.name
    );
  }
}

export async function getAllStocks(): Promise<Stock[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: number; symbol: string; name: string; is_custom: number }>(
    'SELECT id, symbol, name, is_custom FROM stocks ORDER BY symbol ASC'
  );
  return rows.map((r) => ({ id: r.id, symbol: r.symbol, name: r.name, isCustom: !!r.is_custom }));
}

export async function addCustomStock(symbol: string, name: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO stocks (symbol, name, is_custom) VALUES (?, ?, 1)',
    symbol.toUpperCase(),
    name
  );
}

export async function deleteStock(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM stocks WHERE id = ?', id);
}
```

- [ ] **Step 4: Create `src/db/transactionsRepo.ts`**

```ts
import { getDatabase } from './database';
import { Transaction, TransactionType } from '../domain/types';

export async function addTransaction(
  stockId: number,
  type: TransactionType,
  quantity: number,
  price: number,
  date: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO transactions (stock_id, type, quantity, price, date) VALUES (?, ?, ?, ?, ?)',
    stockId,
    type,
    quantity,
    price,
    date
  );
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    stock_id: number;
    type: TransactionType;
    quantity: number;
    price: number;
    date: string;
  }>('SELECT id, stock_id, type, quantity, price, date FROM transactions ORDER BY date DESC, id DESC');
  return rows.map((r) => ({
    id: r.id,
    stockId: r.stock_id,
    type: r.type,
    quantity: r.quantity,
    price: r.price,
    date: r.date,
  }));
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/db
git commit -m "feat: add SQLite database layer and stock/transaction repositories"
```

---

### Task 5: Navigation shell

**Files:**
- Create: `src/navigation/RootNavigator.tsx`
- Create: `src/screens/AddTransactionScreen.tsx` (stub)
- Create: `src/screens/PortfolioScreen.tsx` (stub)
- Create: `src/screens/SummaryScreen.tsx` (stub)
- Create: `src/screens/HistoryScreen.tsx` (stub)
- Modify: `App.tsx`

**Interfaces:**
- Produces: 4 screen components rendered under a bottom-tab navigator, each exported as the default export of its file — Tasks 6-10 fill in their bodies.

- [ ] **Step 1: Install navigation dependencies**

```bash
npx expo install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context
```

- [ ] **Step 2: Create stub screens**

Create `src/screens/AddTransactionScreen.tsx`:

```tsx
import { View, Text } from 'react-native';

export default function AddTransactionScreen() {
  return (
    <View>
      <Text>İşlem Ekle</Text>
    </View>
  );
}
```

Create `src/screens/PortfolioScreen.tsx`:

```tsx
import { View, Text } from 'react-native';

export default function PortfolioScreen() {
  return (
    <View>
      <Text>Portföy</Text>
    </View>
  );
}
```

Create `src/screens/SummaryScreen.tsx`:

```tsx
import { View, Text } from 'react-native';

export default function SummaryScreen() {
  return (
    <View>
      <Text>Özet</Text>
    </View>
  );
}
```

Create `src/screens/HistoryScreen.tsx`:

```tsx
import { View, Text } from 'react-native';

export default function HistoryScreen() {
  return (
    <View>
      <Text>İşlem Geçmişi</Text>
    </View>
  );
}
```

- [ ] **Step 3: Create `src/navigation/RootNavigator.tsx`**

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import SummaryScreen from '../screens/SummaryScreen';
import HistoryScreen from '../screens/HistoryScreen';

const Tab = createBottomTabNavigator();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="İşlem Ekle" component={AddTransactionScreen} />
        <Tab.Screen name="Portföy" component={PortfolioScreen} />
        <Tab.Screen name="Özet" component={SummaryScreen} />
        <Tab.Screen name="Geçmiş" component={HistoryScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 4: Wire it up in `App.tsx`**

Replace the contents of `App.tsx`:

```tsx
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return <RootNavigator />;
}
```

- [ ] **Step 5: Verify it runs**

Run: `npx expo start` and open in Expo Go (scan QR) or a simulator.
Expected: app loads showing 4 bottom tabs ("İşlem Ekle", "Portföy", "Özet", "Geçmiş"), each showing its placeholder text. Stop the dev server after confirming (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add App.tsx src/navigation src/screens
git commit -m "feat: add bottom-tab navigation shell with placeholder screens"
```

---

### Task 6: Searchable stock picker component

**Files:**
- Create: `src/components/StockPicker.tsx`

**Interfaces:**
- Consumes: `Stock` from `src/domain/types.ts` (Task 2); `addCustomStock`, `deleteStock` from `src/db/stocksRepo.ts` (Task 4).
- Produces: `StockPicker` component with props `{ stocks: Stock[]; selectedStockId: number | null; onSelect: (stockId: number) => void; onStocksChanged: () => void }` — consumed by Task 7's `AddTransactionScreen`. `onStocksChanged` is called after a custom stock is added or deleted so the parent can refresh its `stocks` list.

This component covers the spec's "kullanıcı hisseyi elle ekleyip çıkarabilir" requirement: when a search finds no matches, the user can add the searched symbol as a custom stock; long-pressing a custom (non-seed) stock in the list deletes it.

- [ ] **Step 1: Create `src/components/StockPicker.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addCustomStock, deleteStock } from '../db/stocksRepo';
import { Stock } from '../domain/types';

interface StockPickerProps {
  stocks: Stock[];
  selectedStockId: number | null;
  onSelect: (stockId: number) => void;
  onStocksChanged: () => void;
}

export default function StockPicker({ stocks, selectedStockId, onSelect, onStocksChanged }: StockPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [newStockName, setNewStockName] = useState('');

  const selectedStock = stocks.find((s) => s.id === selectedStockId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return stocks;
    return stocks.filter(
      (s) => s.symbol.toUpperCase().includes(q) || s.name.toUpperCase().includes(q)
    );
  }, [stocks, query]);

  async function handleAddCustomStock() {
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;
    if (!newStockName.trim()) {
      Alert.alert('Hata', 'Lütfen hissenin adını da gir.');
      return;
    }
    await addCustomStock(symbol, newStockName.trim());
    onStocksChanged();
    setQuery('');
    setNewStockName('');
  }

  function handleLongPressRow(item: Stock) {
    if (!item.isCustom) return;
    Alert.alert('Hisseyi sil', `${item.symbol} listeden silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await deleteStock(item.id);
          onStocksChanged();
        },
      },
    ]);
  }

  return (
    <View>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text>
          {selectedStock ? `${selectedStock.symbol} - ${selectedStock.name}` : 'Hisse seç'}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Hisse kodu veya adı ara"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect(item.id);
                  setQuery('');
                  setOpen(false);
                }}
                onLongPress={() => handleLongPressRow(item)}
              >
                <Text style={styles.rowSymbol}>{item.symbol}</Text>
                <Text>{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              query.trim() ? (
                <View style={styles.addCustomBox}>
                  <Text>"{query.trim().toUpperCase()}" bulunamadı. Yeni hisse olarak eklemek ister misin?</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Hisse adı (örn. Şirket A.Ş.)"
                    value={newStockName}
                    onChangeText={setNewStockName}
                  />
                  <Pressable style={styles.addButton} onPress={handleAddCustomStock}>
                    <Text style={styles.addButtonText}>Ekle</Text>
                  </Pressable>
                </View>
              ) : null
            }
          />
          <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
            <Text>Kapat</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  modalContainer: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  searchInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 12 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowSymbol: { fontWeight: 'bold' },
  closeButton: { padding: 12, alignItems: 'center' },
  addCustomBox: { marginTop: 12 },
  addButton: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: 'white', fontWeight: 'bold' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/StockPicker.tsx
git commit -m "feat: add searchable stock picker with custom stock add/delete"
```

---

### Task 7: Add Transaction screen

**Files:**
- Modify: `src/screens/AddTransactionScreen.tsx`

**Interfaces:**
- Consumes: `getAllStocks`, `addTransaction` (Task 4), `StockPicker` (Task 6), `validateSellQuantity`, `calculatePortfolioRow` (Task 2), `getAllTransactions` (Task 4).
- Produces: a working form screen; no new exports consumed elsewhere.

- [ ] **Step 1: Implement the form**

Replace `src/screens/AddTransactionScreen.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import StockPicker from '../components/StockPicker';
import { getAllStocks } from '../db/stocksRepo';
import { addTransaction, getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolioRow, validateSellQuantity } from '../domain/calculations';
import { Stock, TransactionType } from '../domain/types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddTransactionScreen() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stockId, setStockId] = useState<number | null>(null);
  const [type, setType] = useState<TransactionType>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(todayIso());

  const reloadStocks = useCallback(() => {
    getAllStocks().then(setStocks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reloadStocks();
    }, [reloadStocks])
  );

  async function handleSubmit() {
    const quantityNum = Number(quantity);
    const priceNum = Number(price);

    if (!stockId) {
      Alert.alert('Hata', 'Lütfen bir hisse seç.');
      return;
    }
    if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
      Alert.alert('Hata', 'Adet pozitif bir sayı olmalı.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      Alert.alert('Hata', 'Fiyat pozitif bir sayı olmalı.');
      return;
    }

    if (type === 'sell') {
      const stock = stocks.find((s) => s.id === stockId)!;
      const allTxs = await getAllTransactions();
      const row = calculatePortfolioRow(stock, allTxs);
      if (!validateSellQuantity(row.heldQuantity, quantityNum)) {
        Alert.alert('Hata', `Elinde bu hisseden yalnızca ${row.heldQuantity} adet var.`);
        return;
      }
    }

    await addTransaction(stockId, type, quantityNum, priceNum, date);
    Alert.alert('Kaydedildi', 'İşlem başarıyla eklendi.');
    setQuantity('');
    setPrice('');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Hisse</Text>
      <StockPicker
        stocks={stocks}
        selectedStockId={stockId}
        onSelect={setStockId}
        onStocksChanged={reloadStocks}
      />

      <Text style={styles.label}>İşlem Türü</Text>
      <View style={styles.typeRow}>
        <Pressable
          style={[styles.typeButton, type === 'buy' && styles.typeButtonActive]}
          onPress={() => setType('buy')}
        >
          <Text>Alım</Text>
        </Pressable>
        <Pressable
          style={[styles.typeButton, type === 'sell' && styles.typeButtonActive]}
          onPress={() => setType('sell')}
        >
          <Text>Satım</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Adet</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={quantity} onChangeText={setQuantity} />

      <Text style={styles.label}>Fiyat (TL)</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={price} onChangeText={setPrice} />

      <Text style={styles.label}>Tarih (YYYY-AA-GG)</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate} />

      <Pressable style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitButtonText}>Kaydet</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { marginTop: 12, marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, alignItems: 'center' },
  typeButtonActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  submitButton: { marginTop: 24, backgroundColor: '#3b82f6', padding: 14, borderRadius: 8, alignItems: 'center' },
  submitButtonText: { color: 'white', fontWeight: 'bold' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

Run: `npx expo start`, open the app, go to "İşlem Ekle": pick a stock, enter a buy transaction, submit, confirm the "Kaydedildi" alert appears. Try selling more than held (with no prior buy) and confirm the blocking alert appears. In the stock picker, search for a symbol not in the seed list and confirm the "add as custom stock" flow works and the new stock becomes selectable. Stop the dev server after confirming.

- [ ] **Step 4: Commit**

```bash
git add src/screens/AddTransactionScreen.tsx
git commit -m "feat: implement Add Transaction screen with validation"
```

---

### Task 8: Portfolio screen

**Files:**
- Modify: `src/screens/PortfolioScreen.tsx`

**Interfaces:**
- Consumes: `getAllStocks`, `getAllTransactions` (Task 4), `calculatePortfolio` (Task 2).

- [ ] **Step 1: Implement the screen**

Replace `src/screens/PortfolioScreen.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolio } from '../domain/calculations';
import { PortfolioRow } from '../domain/types';

export default function PortfolioScreen() {
  const [rows, setRows] = useState<PortfolioRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getAllStocks(), getAllTransactions()]).then(([stocks, txs]) => {
        if (!cancelled) setRows(calculatePortfolio(stocks, txs));
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text>Henüz işlem yok.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.stockId)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.symbol}>
            {item.symbol} — {item.name}
          </Text>
          <Text>Elde tutulan: {item.heldQuantity}</Text>
          <Text>Ortalama maliyet: {item.avgBuyPrice.toFixed(2)} TL</Text>
          <Text style={item.realizedPnL >= 0 ? styles.profit : styles.loss}>
            Gerçekleşen K/Z: {item.realizedPnL.toFixed(2)} TL
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, marginBottom: 12 },
  symbol: { fontWeight: 'bold', marginBottom: 4 },
  profit: { color: '#16a34a', fontWeight: '600' },
  loss: { color: '#dc2626', fontWeight: '600' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

Run: `npx expo start`, add a couple of transactions from "İşlem Ekle", switch to "Portföy", confirm the summary row (held quantity, avg cost, realized P&L) matches expectations. Stop the dev server after confirming.

- [ ] **Step 4: Commit**

```bash
git add src/screens/PortfolioScreen.tsx
git commit -m "feat: implement Portfolio screen"
```

---

### Task 9: History screen (list, delete)

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`

**Interfaces:**
- Consumes: `getAllStocks` (Task 4), `getAllTransactions`, `deleteTransaction` (Task 4).

- [ ] **Step 1: Implement the screen**

Replace `src/screens/HistoryScreen.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getAllStocks } from '../db/stocksRepo';
import { deleteTransaction, getAllTransactions } from '../db/transactionsRepo';
import { Stock, Transaction } from '../domain/types';

export default function HistoryScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stocksById, setStocksById] = useState<Record<number, Stock>>({});

  const load = useCallback(() => {
    Promise.all([getAllStocks(), getAllTransactions()]).then(([stocks, txs]) => {
      setStocksById(Object.fromEntries(stocks.map((s) => [s.id, s])));
      setTransactions(txs);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleDelete(id: number) {
    Alert.alert('İşlemi sil', 'Bu işlemi silmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(id);
          load();
        },
      },
    ]);
  }

  if (transactions.length === 0) {
    return (
      <View style={styles.empty}>
        <Text>Henüz işlem yok.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const stock = stocksById[item.stockId];
        return (
          <View style={styles.card}>
            <Text style={styles.symbol}>
              {stock ? `${stock.symbol} — ${stock.name}` : 'Bilinmeyen hisse'}
            </Text>
            <Text>{item.type === 'buy' ? 'Alım' : 'Satım'} · {item.quantity} adet · {item.price.toFixed(2)} TL</Text>
            <Text>{item.date}</Text>
            <Pressable style={styles.deleteButton} onPress={() => handleDelete(item.id)}>
              <Text style={styles.deleteButtonText}>Sil</Text>
            </Pressable>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, marginBottom: 12 },
  symbol: { fontWeight: 'bold', marginBottom: 4 },
  deleteButton: { marginTop: 8, alignSelf: 'flex-start' },
  deleteButtonText: { color: '#dc2626', fontWeight: '600' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

Run: `npx expo start`, go to "Geçmiş", confirm transactions from earlier tasks are listed, delete one and confirm it disappears and Portfolio screen reflects the change. Stop the dev server after confirming.

- [ ] **Step 4: Commit**

```bash
git add src/screens/HistoryScreen.tsx
git commit -m "feat: implement History screen with delete"
```

---

### Task 10: Summary screen with charts

**Files:**
- Modify: `src/screens/SummaryScreen.tsx`

**Interfaces:**
- Consumes: `getAllStocks`, `getAllTransactions` (Task 4), `calculatePortfolio`, `calculateTotalRealizedPnL`, `calculateCumulativePnLOverTime` (Task 2).

- [ ] **Step 1: Install chart dependencies**

```bash
npx expo install react-native-svg react-native-chart-kit
```

- [ ] **Step 2: Implement the screen**

Replace `src/screens/SummaryScreen.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import {
  calculateCumulativePnLOverTime,
  calculatePortfolio,
  calculateTotalRealizedPnL,
} from '../domain/calculations';
import { CumulativePnLPoint, PortfolioRow } from '../domain/types';

const screenWidth = Dimensions.get('window').width - 32;

export default function SummaryScreen() {
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [points, setPoints] = useState<CumulativePnLPoint[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getAllStocks(), getAllTransactions()]).then(([stocks, txs]) => {
        if (cancelled) return;
        setRows(calculatePortfolio(stocks, txs));
        setPoints(calculateCumulativePnLOverTime(stocks, txs));
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const total = calculateTotalRealizedPnL(rows);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.totalLabel}>Toplam Gerçekleşen Kar/Zarar</Text>
      <Text style={[styles.totalValue, total >= 0 ? styles.profit : styles.loss]}>
        {total.toFixed(2)} TL
      </Text>

      {rows.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Hisse Bazında Kar/Zarar</Text>
          <BarChart
            data={{
              labels: rows.map((r) => r.symbol),
              datasets: [{ data: rows.map((r) => r.realizedPnL) }],
            }}
            width={screenWidth}
            height={220}
            yAxisLabel=""
            yAxisSuffix=" TL"
            chartConfig={chartConfig}
            fromZero
            style={styles.chart}
          />
        </>
      )}

      {points.length > 1 && (
        <>
          <Text style={styles.sectionTitle}>Zaman İçinde Kümülatif Kar/Zarar</Text>
          <LineChart
            data={{
              labels: points.map((p) => p.date.slice(5)),
              datasets: [{ data: points.map((p) => p.cumulativePnL) }],
            }}
            width={screenWidth}
            height={220}
            yAxisLabel=""
            yAxisSuffix=" TL"
            chartConfig={chartConfig}
            style={styles.chart}
          />
        </>
      )}

      {rows.length === 0 && <Text>Henüz işlem yok.</Text>}
    </ScrollView>
  );
}

const chartConfig = {
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  decimalPlaces: 0,
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  totalLabel: { fontSize: 14, color: '#666' },
  totalValue: { fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginTop: 16, marginBottom: 8 },
  chart: { borderRadius: 8 },
  profit: { color: '#16a34a' },
  loss: { color: '#dc2626' },
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification**

Run: `npx expo start`, go to "Özet" with a few buy/sell transactions entered in earlier steps, confirm the total P&L, bar chart, and line chart all render sensibly. Stop the dev server after confirming.

- [ ] **Step 5: Commit**

```bash
git add src/screens/SummaryScreen.tsx
git commit -m "feat: implement Summary screen with charts"
```

---

### Task 11: EAS Build setup and APK generation

**Files:**
- Create: `eas.json`
- Modify: `app.json` (Android package identifier)

**Interfaces:**
- None — this task produces a downloadable APK, not code other tasks depend on.

- [ ] **Step 1: Install the EAS CLI**

```bash
npm install --global eas-cli
```

- [ ] **Step 2: Log in to (or create) a free Expo account**

```bash
eas login
```

If the user doesn't have an account yet, `eas login` prompts to create one at expo.dev — free tier is sufficient for this app.

- [ ] **Step 3: Configure the Android package name**

Edit `app.json`, inside `"expo"`, add:

```json
"android": {
  "package": "com.hissetakip.app"
}
```

- [ ] **Step 4: Initialize EAS Build config**

```bash
eas build:configure
```

This creates/updates `eas.json`. Edit it so the `preview` profile builds an installable APK (not an AAB):

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

- [ ] **Step 5: Run the cloud build**

```bash
eas build --platform android --profile preview
```

This uploads the project and builds in Expo's cloud. When it finishes, EAS prints a download URL for the `.apk` file — download it and install it on the phone (enable "install from unknown sources" if prompted).

- [ ] **Step 6: Commit the build configuration**

```bash
git add eas.json app.json
git commit -m "chore: configure EAS Build for Android APK output"
```

---

## Post-Plan Verification

After all tasks:
1. `npm test` — all `calculations.test.ts` tests pass
2. `npx tsc --noEmit` — no type errors
3. Full manual walkthrough on device/Expo Go: add a buy, add a sell, check Portfolio, Summary, History all agree
4. Install the EAS-built APK on the user's Android phone and repeat the walkthrough there
