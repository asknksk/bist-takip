import { parseEnparaSheet } from '../importParser';

function row(
  date: string,
  orderType: string,
  description: string,
  amount: string
): unknown[] {
  return ['', date, '', orderType, '', '', '', '', description, '', '', '', '', amount];
}

const HEADER_ROWS: unknown[][] = [
  ['', 'Enpara.com Yatırım Hesap Hareketleri', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'Başlangıç tarihi', '', '', '', '', '', '09.06.2026', '', '', '', '', '', ''],
  ['', 'Tarih', '', 'İşlem tipi', '', '', '', '', 'Açıklama', '', '', '', '', 'İşlem Tutarı'],
];

describe('parseEnparaSheet', () => {
  test('parses a buy row: extracts symbol, quantity, and per-share price from the total amount', () => {
    const rows = [
      ...HEADER_ROWS,
      row('09.09.2026', 'Hisse alış', 'EREGL limit alış emri, 1030 adet', '-41.138,20 TL'),
    ];
    const result = parseEnparaSheet(rows);
    expect(result.transactions).toEqual([
      {
        date: '2026-09-09',
        time: '00:00',
        type: 'buy',
        symbol: 'EREGL',
        quantity: 1030,
        price: 41138.2 / 1030,
      },
    ]);
    expect(result.skippedCount).toBe(0);
  });

  test('parses a sell row', () => {
    const rows = [
      ...HEADER_ROWS,
      row('09.09.2026', 'Hisse satış', 'ZOREN limit satış emri, 16658 adet', '41.145,26 TL'),
    ];
    const result = parseEnparaSheet(rows);
    expect(result.transactions).toEqual([
      {
        date: '2026-09-09',
        time: '00:00',
        type: 'sell',
        symbol: 'ZOREN',
        quantity: 16658,
        price: 41145.26 / 16658,
      },
    ]);
  });

  test('skips non-stock rows (funds, transfers, tax) without counting blank rows', () => {
    const rows = [
      ...HEADER_ROWS,
      row('16.06.2026', 'Vergi kesintisi', 'Yatırım işlemleri kaynaklı vergi kesintisi', '-47,46 TL'),
      row('16.06.2026', 'Yatırım fonu satış', 'ENR fon satış emri, 26749 adet', '29.999,81 TL'),
      row('15.06.2026', 'Giden transfer', 'Vadesiz TL hesabıma', '-5.704,67 TL'),
      ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ];
    const result = parseEnparaSheet(rows);
    expect(result.transactions).toEqual([]);
    expect(result.skippedCount).toBe(3);
  });

  test('sorts parsed transactions chronologically regardless of input order', () => {
    const rows = [
      ...HEADER_ROWS,
      row('09.09.2026', 'Hisse alış', 'EREGL limit alış emri, 100 adet', '-1.000,00 TL'),
      row('01.06.2026', 'Hisse alış', 'ASELS limit alış emri, 50 adet', '-500,00 TL'),
    ];
    const result = parseEnparaSheet(rows);
    expect(result.transactions.map((t) => t.date)).toEqual(['2026-06-01', '2026-09-09']);
  });

  test('same-day rows keep their real chronological order: Enpara lists the newest transaction of a day at the top, so within one date the bottom row happened first', () => {
    const rows = [
      ...HEADER_ROWS,
      // File order (top-to-bottom) is newest-first, same as Enpara's export:
      // this sell (entered/executed later in the day) appears above the buy
      // that actually happened earlier that same day.
      row('08.09.2026', 'Hisse satış', 'THYAO limit satış emri, 352 adet', '107.008,00 TL'),
      row('08.09.2026', 'Hisse alış', 'THYAO limit alış emri, 352 adet', '106.216,00 TL'),
    ];
    const result = parseEnparaSheet(rows);
    expect(result.transactions.map((t) => t.type)).toEqual(['buy', 'sell']);
  });

  test('handles an unparseable description by skipping the row', () => {
    const rows = [
      ...HEADER_ROWS,
      row('09.09.2026', 'Hisse alış', 'garbled text with no quantity', '-1.000,00 TL'),
    ];
    const result = parseEnparaSheet(rows);
    expect(result.transactions).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });

  test('returns empty result for an empty sheet', () => {
    expect(parseEnparaSheet([])).toEqual({ transactions: [], skippedCount: 0 });
  });

  test('locates columns by header label even without a leading blank column', () => {
    // Some re-saved/re-downloaded exports omit the leading blank column A
    // entirely, shifting every column index left by one.
    const shiftedHeader: unknown[][] = [
      ['Enpara.com Yatırım Hesap Hareketleri', null, null, null, null, null, null, null, null, null, null, null, null],
      ['Tarih', null, 'İşlem tipi', null, null, null, null, 'Açıklama', null, null, null, 'İşlem Tutarı'],
    ];
    const shiftedRow = [
      '09.09.2026',
      null,
      'Hisse alış',
      null,
      null,
      null,
      null,
      'EREGL limit alış emri, 1030 adet',
      null,
      null,
      null,
      '-41.138,20 TL',
    ];
    const result = parseEnparaSheet([...shiftedHeader, shiftedRow]);
    expect(result.transactions).toEqual([
      {
        date: '2026-09-09',
        time: '00:00',
        type: 'buy',
        symbol: 'EREGL',
        quantity: 1030,
        price: 41138.2 / 1030,
      },
    ]);
  });

  test('finds the header row with no leading metadata rows at all (e.g. user deleted them)', () => {
    const rows = [
      row('09.09.2026', 'Hisse alış', 'EREGL limit alış emri, 1030 adet', '-41.138,20 TL'),
    ];
    // No HEADER_ROWS prepended, and no header row present either — nothing
    // to anchor column positions to, so this must yield no transactions...
    expect(parseEnparaSheet(rows)).toEqual({ transactions: [], skippedCount: 0 });

    // ...but once the header row itself is present (with or without the
    // metadata rows above it), parsing succeeds the same way either way.
    const withHeaderOnly = [
      ['', 'Tarih', '', 'İşlem tipi', '', '', '', '', 'Açıklama', '', '', '', '', 'İşlem Tutarı'],
      row('09.09.2026', 'Hisse alış', 'EREGL limit alış emri, 1030 adet', '-41.138,20 TL'),
    ];
    const result = parseEnparaSheet(withHeaderOnly);
    expect(result.transactions).toEqual([
      {
        date: '2026-09-09',
        time: '00:00',
        type: 'buy',
        symbol: 'EREGL',
        quantity: 1030,
        price: 41138.2 / 1030,
      },
    ]);
  });

  test('returns no transactions and no false skips when the header row cannot be found', () => {
    const rows = [['this', 'is', 'not', 'a', 'recognizable', 'enpara', 'export']];
    expect(parseEnparaSheet(rows)).toEqual({ transactions: [], skippedCount: 0 });
  });
});
