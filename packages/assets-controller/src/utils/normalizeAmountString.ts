import BigNumberJS from 'bignumber.js';

/**
 * Normalize an asset balance `amount` string into a canonical plain-decimal
 * form (no scientific notation), optionally truncating to the asset's decimal
 * precision.
 *
 * Amounts entering `assetsBalance` state come from external sources (snaps,
 * accounts API, websocket, RPC) and may be serialized from JavaScript Numbers
 * as `"1e-18"`. Downstream consumers (e.g. the extension's
 * `parseBalanceWithDecimals`) split on `'.'` and feed the result to `BigInt()`,
 * which throws on exponent-form strings. Normalizing at the controller
 * boundary keeps the invariant that `amount` is always a plain decimal so
 * every current and future data source is safe without per-source changes.
 *
 * When `decimals` is provided (i.e. the asset's metadata is registered),
 * fractional digits beyond `decimals` are truncated using round-toward-zero
 * to match the extension's `parseBalanceWithDecimals`, which slices off any
 * fractional digits beyond `decimals`.
 *
 * When `decimals` is omitted (metadata not yet known for this asset), the
 * amount is left at its natural precision — exponent form is still converted
 * to plain decimal, but no digits are dropped. This preserves balances that
 * arrive before their metadata without lossy truncation.
 *
 * Non-finite or non-string inputs collapse to `'0'` rather than throwing,
 * because controller state must remain JSON-serializable and a malformed
 * upstream payload should not corrupt the rest of the update.
 *
 * @param amount - The raw amount string from a data source.
 * @param decimals - The asset's decimal precision (from `assetsInfo`). Pass
 * `undefined` when metadata is unknown to skip truncation.
 * @returns A plain decimal string (e.g. `"0.000000000000000001"`), or `'0'`
 * for non-finite / non-string input.
 */
export function normalizeAmountString(
  amount: unknown,
  decimals?: number,
): string {
  if (typeof amount !== 'string' || amount.length === 0) {
    return '0';
  }
  const bn = new BigNumberJS(amount);
  if (!bn.isFinite()) {
    return '0';
  }

  let fixed: string;
  if (decimals === undefined || !Number.isFinite(decimals) || decimals < 0) {
    // Metadata unknown — preserve full precision, just defeat exponent form.
    fixed = bn.toFixed();
  } else {
    fixed = bn.toFixed(Math.floor(decimals), BigNumberJS.ROUND_DOWN);
  }

  if (!fixed.includes('.')) {
    return fixed;
  }
  // Trim trailing zeros and a dangling dot: "1.500" -> "1.5", "1.000" -> "1".
  return fixed.replace(/0+$/u, '').replace(/\.$/u, '');
}
