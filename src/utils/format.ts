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
