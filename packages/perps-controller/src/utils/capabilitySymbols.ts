/**
 * Check whether a capability symbol has the provider-independent shape the
 * caller allows.
 *
 * @param symbol - Market symbol supplied by a consumer.
 * @param options - Provider route syntax supported by the caller.
 * @param options.allowProviderRoute - Whether one non-empty `dex:market`
 * route prefix is allowed.
 * @returns Whether the symbol is non-empty, contains no whitespace, and uses
 * the allowed route shape.
 */
export function isValidCapabilitySymbol(
  symbol: string,
  options: { allowProviderRoute: boolean },
): boolean {
  if (symbol.length === 0 || /\s/u.test(symbol)) {
    return false;
  }

  const routeParts = symbol.split(':');
  return options.allowProviderRoute
    ? routeParts.length <= 2 && routeParts.every((part) => part.length > 0)
    : routeParts.length === 1;
}
