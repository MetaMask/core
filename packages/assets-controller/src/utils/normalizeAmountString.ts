import BigNumberJS from 'bignumber.js';

/**
 * Normalize an asset balance `amount` string into plain decimal form with no
 * scientific notation.
 *
 * Amounts entering `assetsBalance` state come from external sources (snaps,
 * accounts API, websocket, RPC) and may be serialized from JavaScript Numbers
 * as `"1e-18"`. Downstream consumers (e.g. the extension's
 * `parseBalanceWithDecimals`) split on `'.'` and feed the result to `BigInt()`,
 * which throws on exponent-form strings. Normalizing at the controller
 * boundary keeps a single invariant — `amount` is always plain decimal — so
 * every current and future data source is safe without per-source changes.
 *
 * Non-finite or non-string inputs collapse to `'0'` rather than throwing,
 * because controller state must remain JSON-serializable and a malformed
 * upstream payload should not corrupt the rest of the update.
 *
 * @param amount - The raw amount string from a data source.
 * @returns A plain decimal string (e.g. `"0.000000000000000001"`), or `'0'`
 * for non-finite / non-string input.
 */
const PLAIN_DECIMAL_REGEX = /^-?\d+(?:\.\d+)?$/u;

export function normalizeAmountString(amount: unknown): string {
  if (typeof amount !== 'string' || amount.length === 0) {
    return '0';
  }
  // Fast path: already canonical plain decimal — return bit-identical so
  // existing snapshot/equality checks aren't perturbed by re-formatting.
  if (PLAIN_DECIMAL_REGEX.test(amount)) {
    return amount;
  }
  const bn = new BigNumberJS(amount);
  if (!bn.isFinite()) {
    return '0';
  }
  return bn.toFixed();
}
