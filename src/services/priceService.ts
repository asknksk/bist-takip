/**
 * Fetches a delayed/best-effort current price for a BIST symbol from
 * Yahoo Finance's public (unofficial, unauthenticated) chart endpoint.
 * No API key, but no uptime/accuracy guarantee either — this is
 * explicitly an estimate, not a live/official quote.
 */
export async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}.IS?interval=1d&range=1d`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return null;
    const json = await response.json();
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

/** Fetches prices for several symbols in parallel, tolerating individual failures. */
export async function fetchCurrentPrices(symbols: string[]): Promise<Map<string, number | null>> {
  const uniqueSymbols = Array.from(new Set(symbols));
  const results = await Promise.all(
    uniqueSymbols.map(async (symbol) => [symbol, await fetchCurrentPrice(symbol)] as const)
  );
  return new Map(results);
}
