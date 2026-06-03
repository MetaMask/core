import BigNumberJS from 'bignumber.js';

/**
 * Normalize an asset balance `amount` string into a canonical plain-decimal
 * form, truncated to the asset's decimal precision.
 *
 * Amounts entering `assetsBalance` state come from external sources (snaps,
 * accounts API, websocket, RPC) and may be serialized from JavaScript Numbers
 * as `"1e-18"`. Downstream consumers (e.g. the extension's
 * `parseBalanceWithDecimals`) split on `'.'` and feed the result to `BigInt()`,
 * which throws on exponent-form strings. Normalizing at the controller
 * boundary keeps the invariant that `amount` is always a plain decimal so
 * every current and future data source is safe without per-source changes.
 *
 * Truncation (round-toward-zero) is used rather than rounding, to match the
 * extension's `parseBalanceWithDecimals` which slices off any fractional
 * digits beyond `decimals`. Trailing zeros are trimmed so e.g. `"1.5"` is
 * preserved as `"1.5"` rather than padded to the full precision.
 *
 * If `decimals` is unknown (no metadata for this asset yet) callers should
 * pass `0`, which truncates to the integer part — the conservative fallback
 * for an asset whose precision we don't yet know.
 *
 * Non-finite or non-string inputs collapse to `'0'` rather than throwing,
 * because controller state must remain JSON-serializable and a malformed
 * upstream payload should not corrupt the rest of the update.
 *
 * @param amount - The raw amount string from a data source.
 * @param decimals - The asset's decimal precision (from `assetsInfo`); defaults
 * to `0` when no metadata is available.
 * @returns A plain decimal string (e.g. `"0.000000000000000001"`), or `'0'`
 * for non-finite / non-string input.
 */
export function normalizeAmountString(
  amount: unknown,
  decimals: number = 0,
): string {
  if (typeof amount !== 'string' || amount.length === 0) {
    return '0';
  }
  const bn = new BigNumberJS(amount);
  if (!bn.isFinite()) {
    return '0';
  }
  const safeDecimals = Math.max(0, Math.floor(decimals));
  const fixed = bn.toFixed(safeDecimals, BigNumberJS.ROUND_DOWN);
  if (!fixed.includes('.')) {
    return fixed;
  }
  // Trim trailing zeros and a dangling dot: "1.500" -> "1.5", "1.000" -> "1".
  return fixed.replace(/0+$/u, '').replace(/\.$/u, '');
}
