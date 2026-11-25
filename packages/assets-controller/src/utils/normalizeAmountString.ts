import { BigNumber as BigNumberJS } from 'bignumber.js';

/**
 * Fast-path pattern for a plain decimal literal: optional sign, then digits
 * with an optional fractional part (at least one digit overall). Inputs that
 * do not match (exponent form, whitespace, radix prefixes, garbage) fall back
 * to the BigNumber path, which defines the canonical behavior.
 */
const PLAIN_DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u;

/**
 * `toFixed()` throws for decimal places above BigNumber's `MAX_DP`. Above this
 * bound the fast path defers to BigNumber so behavior (including throwing)
 * stays byte-identical to the original implementation.
 */
const MAX_FAST_DECIMALS = 1000;

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
 * The overwhelmingly common input is a plain decimal string, which is
 * normalized with pure string manipulation (a measured hot path on mobile);
 * anything else goes through `BigNumber`, preserving the original behavior
 * exactly.
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
  if (PLAIN_DECIMAL_PATTERN.test(amount)) {
    return normalizePlainDecimal(amount, decimals);
  }
  return normalizeWithBigNumber(amount, decimals);
}

/**
 * Canonical normalization for plain decimal strings (no exponent, no
 * whitespace, no radix prefix), mirroring `BigNumber#toFixed` output exactly:
 * leading integer zeros stripped, trailing fractional zeros and a dangling
 * dot trimmed, and the sign dropped for zero.
 */
function normalizePlainDecimal(
  amount: string,
  decimals?: number,
): string {
  let body = amount;
  let negative = false;
  const first = amount[0];
  if (first === '+' || first === '-') {
    negative = first === '-';
    body = amount.slice(1);
  }

  const dot = body.indexOf('.');
  const intRaw = dot === -1 ? body : body.slice(0, dot);
  let fracRaw = dot === -1 ? '' : body.slice(dot + 1);

  if (
    decimals !== undefined &&
    Number.isFinite(decimals) &&
    decimals >= 0
  ) {
    const dp = Math.floor(decimals);
    if (dp > MAX_FAST_DECIMALS) {
      // Absurd precision (BigNumber would throw above MAX_DP) — defer.
      return normalizeWithBigNumber(amount, decimals);
    }
    if (fracRaw.length > dp) {
      // Round toward zero: cut excess fractional digits.
      fracRaw = fracRaw.slice(0, dp);
    }
  }

  // Strip leading integer zeros, keeping a single digit ('007' -> '7').
  const intPart = intRaw === '' ? '0' : intRaw.replace(/^0+(?=\d)/u, '');
  // Trim trailing fractional zeros ('1.500' -> '1.5', '1.000' -> '1').
  const fracPart = fracRaw.replace(/0+$/u, '');

  if (intPart === '0' && fracPart === '') {
    // The truncated value is zero. BigNumber drops the sign for a value that
    // parsed as exactly zero ('-0.000' -> '0'), but keeps it when a nonzero
    // value is truncated toward zero to zero ('-0.5' at 0 decimals -> '-0').
    if (negative && !/^0*(?:\.0*)?$/u.test(body)) {
      return '-0';
    }
    return '0';
  }
  if (fracPart === '') {
    return negative ? `-${intPart}` : intPart;
  }
  return negative ? `-${intPart}.${fracPart}` : `${intPart}.${fracPart}`;
}

/**
 * The original BigNumber-based normalization, kept verbatim as the fallback
 * for exponent form, whitespace, radix-prefixed and other non-plain inputs.
 */
function normalizeWithBigNumber(
  amount: string,
  decimals?: number,
): string {
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
