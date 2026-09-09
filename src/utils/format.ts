/**
 * Formats a number using Turkish convention: "." as the thousands
 * separator and "," as the decimal separator (e.g. 19845.32 -> "19.845,32").
 * For display only — use PriceStepperInput's own formatPrice/parsePriceInput
 * for editable numeric fields, since those need a simpler round-trip format.
 */
export function formatCurrency(n: number, fractionDigits: number = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

/**
 * Formats a ratio (e.g. P&L / cost basis) as a Turkish-style percentage:
 * the sign comes before the "%", not after the number (e.g. "-%2,73").
 */
export function formatPercent(ratio: number, fractionDigits: number = 2): string {
  const sign = ratio < 0 ? '-' : '';
  const magnitude = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Math.abs(ratio) * 100);
  return `${sign}%${magnitude}`;
}
