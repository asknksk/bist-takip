export interface ParsedImportTransaction {
  date: string; // YYYY-MM-DD
  time: string; // "HH:MM" — the export has no time, so this is a fixed placeholder
  type: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  price: number;
}

export interface SkippedImportRow {
  date: string; // raw cell text — may not be a valid date (e.g. a footer row)
  orderType: string;
  description: string;
  amount: string;
  reason: string;
}

export interface ImportParseResult {
  transactions: ParsedImportTransaction[];
  skippedCount: number;
  skippedRows: SkippedImportRow[];
}

const HEADER_LABELS = {
  date: 'Tarih',
  orderType: 'İşlem tipi',
  description: 'Açıklama',
  amount: 'İşlem Tutarı',
} as const;

interface ColumnIndexes {
  date: number;
  orderType: number;
  description: number;
  amount: number;
}

const DESCRIPTION_REGEX = /^(\S+)\s+.*?,\s*([\d.,]+)\s*adet\s*$/i;

function parseTurkishDate(raw: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseTurkishNumber(raw: string): number {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  return Number(normalized);
}

function parseTurkishAmount(raw: string): number {
  const numeric = raw.replace(/\s*TL\s*$/i, '').trim();
  return parseTurkishNumber(numeric);
}

/**
 * Locates the header row (containing the "Tarih"/"İşlem tipi"/"Açıklama"/
 * "İşlem Tutarı" labels) and returns each column's index. The exported
 * sheet has a variable number of leading blank columns depending on how
 * it was downloaded/re-saved, so columns are found by label, not by a
 * fixed position.
 */
function findColumnIndexes(rows: unknown[][]): ColumnIndexes | null {
  for (const row of rows) {
    const cells = row.map((cell) => String(cell ?? '').trim());
    const dateIdx = cells.indexOf(HEADER_LABELS.date);
    const orderTypeIdx = cells.indexOf(HEADER_LABELS.orderType);
    const descriptionIdx = cells.indexOf(HEADER_LABELS.description);
    const amountIdx = cells.indexOf(HEADER_LABELS.amount);
    if (dateIdx !== -1 && orderTypeIdx !== -1 && descriptionIdx !== -1 && amountIdx !== -1) {
      return { date: dateIdx, orderType: orderTypeIdx, description: descriptionIdx, amount: amountIdx };
    }
  }
  return null;
}

/**
 * Parses an Enpara.com "Yatırım Hesap Hareketleri" export (read as a 2D
 * array of cell values, e.g. via SheetJS `sheet_to_json(sheet, { header: 1 })`).
 * Only "Hisse alış"/"Hisse satış" rows become transactions; everything else
 * (fund trades, transfers, tax deductions, header/footer rows) is skipped.
 */
export function parseEnparaSheet(rows: unknown[][]): ImportParseResult {
  const transactions: ParsedImportTransaction[] = [];
  const skippedRows: SkippedImportRow[] = [];

  const columns = findColumnIndexes(rows);
  if (!columns) {
    return { transactions: [], skippedCount: 0, skippedRows: [] };
  }

  for (const row of rows) {
    const dateRaw = String(row[columns.date] ?? '');
    const dateIso = parseTurkishDate(dateRaw);
    if (!dateIso) continue; // not a data row (header/footer/blank line)

    const orderType = String(row[columns.orderType] ?? '').trim();
    const description = String(row[columns.description] ?? '');
    const amountRaw = String(row[columns.amount] ?? '');

    if (orderType !== 'Hisse alış' && orderType !== 'Hisse satış') {
      skippedRows.push({
        date: dateRaw,
        orderType,
        description,
        amount: amountRaw,
        reason: 'Hisse alım/satım işlemi değil',
      });
      continue;
    }

    const match = DESCRIPTION_REGEX.exec(description);

    if (!match) {
      skippedRows.push({
        date: dateRaw,
        orderType,
        description,
        amount: amountRaw,
        reason: 'Açıklama satırı okunamadı',
      });
      continue;
    }

    const symbol = match[1].toUpperCase();
    const quantity = parseTurkishNumber(match[2]);
    const amount = Math.abs(parseTurkishAmount(amountRaw));

    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount <= 0) {
      skippedRows.push({
        date: dateRaw,
        orderType,
        description,
        amount: amountRaw,
        reason: 'Adet veya tutar geçersiz',
      });
      continue;
    }

    transactions.push({
      date: dateIso,
      time: '00:00',
      type: orderType === 'Hisse alış' ? 'buy' : 'sell',
      symbol,
      quantity,
      price: amount / quantity,
    });
  }

  // Enpara (like most brokerage statements) lists the most recent
  // transaction of each day first, so a row further down the sheet happened
  // earlier. Reversing before the (stable) date sort turns that into
  // oldest-first both across dates and within a single day — matching real
  // trade order, which matters once transactions.ts starts walking them
  // chronologically to compute a moving average cost.
  transactions.reverse();
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  return { transactions, skippedCount: skippedRows.length, skippedRows };
}
