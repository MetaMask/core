import { BigNumber as BigNumberJS } from 'bignumber.js';

/**
 * Fast-path pattern for a plain decimal literal: optional sign, then digits
 * with an optional fractional part (at least one digit overall).
 */
const PLAIN_DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u;

/**
 * Fast-path pattern for exponent notation: a plain decimal mantissa followed
 * by a (bounded) decimal exponent. Larger exponents fall back to BigNumber,
 * which defines the canonical behavior.
 */
const EXPONENT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d{1,3}$/u;

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
 * The overwhelmingly common inputs — plain decimal strings and simple
 * exponent notation — are normalized with pure string manipulation (a
 * measured hot path on mobile); anything else goes through `BigNumber`,
 * preserving the original behavior exactly.
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
  if (EXPONENT_PATTERN.test(amount)) {
    return normalizeExponentDecimal(amount, decimals);
  }
  return normalizeWithBigNumber(amount, decimals);
}

/**
 * Canonical normalization for a plain decimal string (no exponent), mirroring
 * `BigNumber#toFixed` output exactly.
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
  const fracRaw = dot === -1 ? '' : body.slice(dot + 1);
  return finishNormalize(intRaw, fracRaw, intRaw + fracRaw, negative, decimals, amount);
}

/**
 * Canonical normalization for exponent notation (`"1e-18"`, `"2.5E2"`): the
 * decimal point is shifted in string space, then the shared canonicalization
 * runs — mirroring `BigNumber#toFixed` output exactly.
 */
function normalizeExponentDecimal(
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

  const eIdx = body.indexOf('e') === -1 ? body.indexOf('E') : body.indexOf('e');
  const mantissa = body.slice(0, eIdx);
  const exponent = Number(body.slice(eIdx + 1));

  const dot = mantissa.indexOf('.');
  const intRaw = dot === -1 ? mantissa : mantissa.slice(0, dot);
  const fracRaw = dot === -1 ? '' : mantissa.slice(dot + 1);
  const digits = intRaw + fracRaw;
  const point = intRaw.length + exponent;

  let intPart: string;
  let fracPart: string;
  if (point <= 0) {
    intPart = '0';
    fracPart = '0'.repeat(-point) + digits;
  } else if (point >= digits.length) {
    intPart = digits + '0'.repeat(point - digits.length);
    fracPart = '';
  } else {
    intPart = digits.slice(0, point);
    fracPart = digits.slice(point);
  }
  return finishNormalize(intPart, fracPart, digits, negative, decimals, amount);
}

/**
 * Shared tail of both fast paths: optional truncation to `decimals` fractional
 * digits (round toward zero), leading-integer-zero strip, trailing-fractional-
 * zero trim, and BigNumber-compatible zero-sign handling. `rawDigits` is the
 * untruncated significand, used to distinguish values that parsed as exactly
 * zero (sign dropped) from nonzero values truncated toward zero to zero
 * (sign kept: `'-0'`).
 */
function finishNormalize(
  intPart: string,
  fracPart: string,
  rawDigits: string,
  negative: boolean,
  decimals: number | undefined,
  amount: string,
): string {
  if (
    decimals !== undefined &&
    Number.isFinite(decimals) &&
    decimals >= 0
  ) {
    const dp = Math.floor(decimals);
    if (dp > MAX_FAST_DECIMALS) {
      // Absurd precision (BigNumber throws above MAX_DP) — defer to it.
      return normalizeWithBigNumber(amount, decimals);
    }
    if (fracPart.length > dp) {
      // Round toward zero: cut excess fractional digits.
      fracPart = fracPart.slice(0, dp);
    }
  }

  // Strip leading integer zeros, keeping a single digit ('007' -> '7').
  const intNorm = intPart === '' ? '0' : intPart.replace(/^0+(?=\d)/u, '');
  // Trim trailing fractional zeros ('1.500' -> '1.5', '1.000' -> '1').
  const fracNorm = fracPart.replace(/0+$/u, '');

  if (intNorm === '0' && fracNorm === '') {
    // BigNumber drops the sign for a value that parsed as exactly zero
    // ('-0.000' -> '0'), but keeps it when a nonzero value is truncated
    // toward zero to zero ('-0.5' at 0 decimals -> '-0').
    if (negative && !/^0+$/u.test(rawDigits)) {
      return '-0';
    }
    return '0';
  }
  if (fracNorm === '') {
    return negative ? `-${intNorm}` : intNorm;
  }
  return negative ? `-${intNorm}.${fracNorm}` : `${intNorm}.${fracNorm}`;
}

/**
 * The original BigNumber-based normalization, kept verbatim as the fallback
 * for whitespace-padded, radix-prefixed, oversized-exponent and other
 * non-plain inputs.
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
