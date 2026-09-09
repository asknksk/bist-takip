export interface ParsedImportTransaction {
  date: string; // YYYY-MM-DD
  type: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  price: number;
}

export interface ImportParseResult {
  transactions: ParsedImportTransaction[];
  skippedCount: number;
}

const ORDER_TYPE_COL = 3;
const DATE_COL = 1;
const DESCRIPTION_COL = 8;
const AMOUNT_COL = 13;

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
 * Parses an Enpara.com "Yatırım Hesap Hareketleri" export (read as a 2D
 * array of cell values, e.g. via SheetJS `sheet_to_json(sheet, { header: 1 })`).
 * Only "Hisse alış"/"Hisse satış" rows become transactions; everything else
 * (fund trades, transfers, tax deductions, header/footer rows) is skipped.
 */
export function parseEnparaSheet(rows: unknown[][]): ImportParseResult {
  const transactions: ParsedImportTransaction[] = [];
  let skippedCount = 0;

  for (const row of rows) {
    const dateIso = parseTurkishDate(String(row[DATE_COL] ?? ''));
    if (!dateIso) continue; // not a data row (header/footer/blank line)

    const orderType = String(row[ORDER_TYPE_COL] ?? '').trim();
    if (orderType !== 'Hisse alış' && orderType !== 'Hisse satış') {
      skippedCount += 1;
      continue;
    }

    const description = String(row[DESCRIPTION_COL] ?? '');
    const amountRaw = String(row[AMOUNT_COL] ?? '');
    const match = DESCRIPTION_REGEX.exec(description);

    if (!match) {
      skippedCount += 1;
      continue;
    }

    const symbol = match[1].toUpperCase();
    const quantity = parseTurkishNumber(match[2]);
    const amount = Math.abs(parseTurkishAmount(amountRaw));

    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount <= 0) {
      skippedCount += 1;
      continue;
    }

    transactions.push({
      date: dateIso,
      type: orderType === 'Hisse alış' ? 'buy' : 'sell',
      symbol,
      quantity,
      price: amount / quantity,
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  return { transactions, skippedCount };
}
