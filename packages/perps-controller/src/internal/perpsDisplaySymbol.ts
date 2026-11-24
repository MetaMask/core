/**
 * Display symbol of a market: the part after the HIP-3 DEX prefix
 * (`xyz:TSLA` → `TSLA`), or the symbol itself.
 *
 * Lives in a leaf module so `sortMarkets` and `marketUtils` can both use it
 * without importing each other. Public through `marketUtils`.
 *
 * @param symbol - The market symbol.
 * @returns The display symbol.
 */
export const getPerpsDisplaySymbol = (symbol: string): string => {
  if (!symbol || typeof symbol !== 'string') {
    return symbol;
  }

  const colonIndex = symbol.indexOf(':');
  if (colonIndex > 0 && colonIndex < symbol.length - 1) {
    return symbol.substring(colonIndex + 1);
  }

  return symbol;
};
