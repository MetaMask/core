import type { Quote } from './RampsService';

/**
 * Whether a quote's checkout runs in an external / system browser rather than
 * an in-app WebView. Decided by the per-quote `buyWidget.browser` hint from the
 * quotes API. When the hint is absent the quote is treated as in-app (the
 * caller is responsible for the in-app WebView fail-safe).
 *
 * This is the pure classification only: it deliberately knows nothing about
 * host redirect URLs or deeplink schemes, which stay in the consuming client.
 *
 * @param quote - The quote to classify.
 * @returns Whether the quote uses an external browser.
 */
export function isExternalBrowserQuote(quote: Quote): boolean {
  return quote.quote?.buyWidget?.browser === 'IN_APP_OS_BROWSER';
}

/**
 * Whether a quote is a custom-action ("checkout outside of MetaMask") quote,
 * e.g. PayPal or Robinhood. Reads the inline `isCustomAction` flag, which the
 * wire may carry even though it is absent from the published `Quote` type.
 *
 * @param quote - The quote to classify.
 * @returns Whether the quote is a custom-action quote.
 */
export function isCustomActionQuote(quote: Quote): boolean {
  return (quote.quote as { isCustomAction?: boolean })?.isCustomAction === true;
}

/**
 * Whether a quote continues inside an in-app WebView, i.e. it is neither a
 * custom-action quote nor an external-browser quote. This is the Phase 1
 * in-app-only inclusion test.
 *
 * @param quote - The quote to classify.
 * @returns Whether the quote is an in-app WebView quote.
 */
export function isInAppOnlyQuote(quote: Quote): boolean {
  return !isCustomActionQuote(quote) && !isExternalBrowserQuote(quote);
}
