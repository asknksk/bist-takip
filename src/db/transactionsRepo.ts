import { getDatabase } from './database';
import { Transaction, TransactionType } from '../domain/types';

export async function addTransaction(
  stockId: number,
  type: TransactionType,
  quantity: number,
  price: number,
  date: string,
  time: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO transactions (stock_id, type, quantity, price, date, time) VALUES (?, ?, ?, ?, ?, ?)',
    stockId,
    type,
    quantity,
    price,
    date,
    time
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
    time: string;
  }>(
    'SELECT id, stock_id, type, quantity, price, date, time FROM transactions ORDER BY date DESC, time DESC, id DESC'
  );
  return rows.map((r) => ({
    id: r.id,
    stockId: r.stock_id,
    type: r.type,
    quantity: r.quantity,
    price: r.price,
    date: r.date,
    time: r.time,
  }));
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

export async function deleteTransactionsByStock(stockId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM transactions WHERE stock_id = ?', stockId);
}

export async function deleteAllTransactions(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM transactions');
}
