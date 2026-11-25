import { BigNumber as BigNumberJS } from 'bignumber.js';

const CHAR_PLUS = 43;
const CHAR_MINUS = 45;
const CHAR_DOT = 46;
const CHAR_0 = 48;
const CHAR_9 = 57;
const CHAR_e = 101;
const CHAR_E = 69;

/**
 * `toFixed()` throws for decimal places above BigNumber's `MAX_DP`. Above this
 * bound the fast path defers to BigNumber so behavior (including throwing)
 * stays byte-identical to the original implementation.
 */
const MAX_FAST_DECIMALS = 1000;

/**
 * Matches an already-canonical plain decimal (no sign, no leading integer
 * zeros, no dangling dot, no trailing fractional zeros) — the form
 * `BigNumber#toFixed` would return verbatim. Note: without the `m` flag,
 * `$` does not match before a terminal newline, so newline-padded inputs
 * correctly fail this test and fall back to BigNumber (which trims them).
 */
const CANONICAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;

/**
 * Read BigNumber's live `RANGE` bound — the ± magnitude limit within which
 * decimal values parse finitely and exactly. Beyond it, `BigNumber` parses
 * values as ±Infinity (large) or collapses them to zero (tiny), and the
 * fallback implementation returns `'0'` for those, so every fast path must
 * defer to BigNumber whenever a value's magnitude could exceed the bound.
 * `RANGE` defaults to ±1e7, far above any realistic balance string.
 *
 * This is read fresh on EVERY call that is about to use a fast path: a
 * global `BigNumber.config({ RANGE })` change must be obeyed by the very
 * next call, not some number of calls later. `BigNumber#config()` allocates
 * its result object, but that cost (a fraction of a single BigNumber parse)
 * is the price of exact semantics — a cached bound would silently return
 * wrong values between the config change and the next cache refresh.
 */
function liveRangeBound(): number {
  const range = BigNumberJS.config().RANGE;
  if (typeof range === 'number') {
    return range < 0 ? -range : range;
  }
  const lo = range[0] < 0 ? -range[0] : range[0];
  const hi = range[1] < 0 ? -range[1] : range[1];
  return lo < hi ? lo : hi;
}

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
 * preserving the original behavior exactly. Every fast-path decision that
 * depends on BigNumber's configuration reads the live config on that call
 * (see `liveRangeBound`), so a global `BigNumber.config` change is obeyed
 * immediately.
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
  // Already-canonical inputs (the common case) return verbatim — one native
  // regex test instead of a character scan, with zero string allocation.
  if (CANONICAL_PATTERN.test(amount)) {
    const dot = amount.indexOf('.');
    const intLen = dot === -1 ? amount.length : dot;
    // Unconditionally config-safe: a value whose magnitude exponent is in
    // [-1, 1] (or exactly zero) parses identically under EVERY valid
    // BigNumber config — `RANGE` is validated to a bound of at least 1 in
    // magnitude, and no other knob affects decimal parsing or an
    // explicit-argument `toFixed`. For canonical strings that means: two
    // integer digits ('42', '99.99' — e = 1), one nonzero integer digit
    // ('5', '5.25' — e = 0), '0' followed by a nonzero fractional digit
    // ('0.5' — e = -1), or the bare '0'. Everything else must check the
    // live RANGE bound — the next call must obey any config change.
    const configSafe =
      intLen === 2 ||
      (intLen === 1 &&
        (amount.charCodeAt(0) !== CHAR_0 ||
          dot === -1 ||
          amount.charCodeAt(dot + 1) !== CHAR_0));
    if (!configSafe && amount.length > liveRangeBound()) {
      // A value's magnitude never exceeds its digit count, so the length
      // check suffices unless the string is implausibly long.
      return normalizeWithBigNumber(amount, decimals);
    }
    // `NaN >= 0` is false, so typeof + comparison covers undefined, NaN and
    // negatives; +Infinity is routed to BigNumber via the MAX check below.
    if (typeof decimals !== 'number' || decimals < 0) {
      return amount;
    }
    const dp = Math.floor(decimals);
    if (dp > MAX_FAST_DECIMALS) {
      return normalizeWithBigNumber(amount, decimals);
    }
    const fracLen = dot === -1 ? 0 : amount.length - dot - 1;
    if (dot === -1 || fracLen <= dp) {
      return amount;
    }
    // Truncation needed — fall through to the general fast path.
  }
  const fast = normalizePlainOrExponent(amount, decimals);
  return fast === undefined ? normalizeWithBigNumber(amount, decimals) : fast;
}

/**
 * Fast path for plain decimal literals and simple exponent notation,
 * mirroring `BigNumber#toFixed` output exactly: leading integer zeros
 * stripped, trailing fractional zeros and a dangling dot trimmed, exponent
 * form expanded by shifting the decimal point, and BigNumber's zero-sign
 * behavior preserved.
 *
 * Returns `undefined` when the input is not a plain decimal / simple
 * exponent form, or when `decimals` is out of the fast path's safe range —
 * callers must defer to BigNumber in that case.
 */
function normalizePlainOrExponent(
  amount: string,
  decimals: number | undefined,
): string | undefined {
  const length = amount.length;
  let i = 0;
  let negative = false;
  let c = amount.charCodeAt(0);
  if (c === CHAR_PLUS || c === CHAR_MINUS) {
    negative = c === CHAR_MINUS;
    i = 1;
  }

  // Integer part.
  const intStart = i;
  c = i < length ? amount.charCodeAt(i) : -1;
  let hasNonZero = false;
  while (c >= CHAR_0 && c <= CHAR_9) {
    if (c !== CHAR_0) {
      hasNonZero = true;
    }
    i += 1;
    c = i < length ? amount.charCodeAt(i) : -1;
  }
  const intLen = i - intStart;

  // Optional fractional part.
  let fracStart = i;
  let fracLen = 0;
  let fracFirstNonZero = -1; // index of the first nonzero fractional digit
  if (c === CHAR_DOT) {
    i += 1;
    fracStart = i;
    c = i < length ? amount.charCodeAt(i) : -1;
    while (c >= CHAR_0 && c <= CHAR_9) {
      if (c !== CHAR_0) {
        hasNonZero = true;
        if (fracFirstNonZero === -1) {
          fracFirstNonZero = i;
        }
      }
      i += 1;
      c = i < length ? amount.charCodeAt(i) : -1;
    }
    fracLen = i - fracStart;
  }

  if (intLen === 0 && fracLen === 0) {
    return undefined; // Not a plain decimal — defer to BigNumber.
  }

  // Strip leading integer zeros, keeping a single digit ('007' -> '7').
  // (Shared by the config-safety check below and the plain assembly.)
  let intZeroEnd = 0;
  while (
    intZeroEnd < intLen - 1 &&
    amount.charCodeAt(intStart + intZeroEnd) === CHAR_0
  ) {
    intZeroEnd += 1;
  }
  const intDigits = intLen - intZeroEnd;
  const intIsAllZero =
    intDigits === 0 ||
    (intDigits === 1 && amount.charCodeAt(intStart + intZeroEnd) === CHAR_0);

  // Unconditionally config-safe: a value whose magnitude exponent is in
  // [-1, 1] (or exactly zero) parses identically under EVERY valid BigNumber
  // config (`RANGE` is validated to a bound of at least 1 in magnitude; no
  // other knob affects decimal parsing or explicit-argument `toFixed`).
  // Safe shapes: at most two integer digits after zero-stripping with a
  // nonzero lead ('007.5', '99.99' — e <= 1), or a value below 1 whose
  // first fractional digit is nonzero ('0.5', '.5' — e = -1), or any
  // all-zero value. Everything else must check the live RANGE bound.
  const configSafe =
    !hasNonZero ||
    (!intIsAllZero && intDigits <= 2) ||
    (intIsAllZero && fracFirstNonZero === fracStart);

  // The fast path is only value-preserving within BigNumber's live RANGE
  // bound (see `liveRangeBound`): beyond it, values parse as ±Infinity or
  // zero. Read fresh on this call — never cached.
  const magnitude = intLen > fracLen ? intLen : fracLen;
  if (!configSafe && magnitude > liveRangeBound()) {
    return undefined;
  }

  // Truncation to the asset's precision is active for any finite,
  // non-negative `decimals` (matching the BigNumber branch exactly). `NaN >= 0`
  // is false, so typeof + comparison covers every non-truncating case.
  const truncate = typeof decimals === 'number' && decimals >= 0;
  const dp = truncate ? Math.floor(decimals ?? 0) : 0;
  if (truncate && dp > MAX_FAST_DECIMALS) {
    // Absurd precision (BigNumber throws above MAX_DP) — defer to it.
    return undefined;
  }

  if (c === CHAR_e || c === CHAR_E) {
    // Exponent notation: shift the decimal point in string space.
    i += 1;
    let exponentNegative = false;
    c = i < length ? amount.charCodeAt(i) : -1;
    if (c === CHAR_PLUS || c === CHAR_MINUS) {
      exponentNegative = c === CHAR_MINUS;
      i += 1;
      c = i < length ? amount.charCodeAt(i) : -1;
    }
    let exponent = 0;
    let expLen = 0;
    while (c >= CHAR_0 && c <= CHAR_9) {
      exponent = exponent * 10 + (c - CHAR_0);
      expLen += 1;
      i += 1;
      c = i < length ? amount.charCodeAt(i) : -1;
    }
    // Bound the exponent: larger (or malformed / trailing-junk) forms defer
    // to BigNumber, which defines the canonical behavior.
    if (expLen === 0 || expLen > 3 || i !== length) {
      return undefined;
    }
    // An exponent shifts the value's magnitude exponent, so safety must be
    // judged on the SHIFTED exponent, not the significand's. Only a zero
    // significand or a shifted magnitude within [-1, 1] is unconditionally
    // config-safe; everything else gates against the live RANGE bound (the
    // shift is bounded by the 3-digit exponent limit, hence +999).
    const shiftedExp = intIsAllZero
      ? exponent - 1 - (fracFirstNonZero - fracStart)
      : intLen - 1 - intZeroEnd + exponent;
    if (
      !(!hasNonZero || (shiftedExp <= 1 && shiftedExp >= -1)) &&
      magnitude + 999 > liveRangeBound()
    ) {
      return undefined;
    }
    if (exponentNegative) {
      exponent = -exponent;
    }

    const digits =
      amount.slice(intStart, intStart + intLen) +
      (fracLen > 0 ? amount.slice(fracStart, fracStart + fracLen) : '');
    const point = intLen + exponent;

    // Zero significand ('0e5', '0.00e-3') is exactly zero regardless of sign.
    if (!hasNonZero) {
      return '0';
    }

    const firstIsZero = digits.charCodeAt(0) === CHAR_0;
    const lastIsZero = digits.charCodeAt(digits.length - 1) === CHAR_0;

    // Common exponent shapes with no cleanup needed assemble in one
    // expression, avoiding intermediate string allocations.
    if (point <= 0) {
      const fracTotal = -point + digits.length;
      if (!lastIsZero && (!truncate || fracTotal <= dp)) {
        // e.g. '1e-18' -> '0.000000000000000001'
        return (negative ? '-0.' : '0.') + '0'.repeat(-point) + digits;
      }
    } else if (point >= digits.length) {
      if (digits.length === 1 || !firstIsZero) {
        // e.g. '2.5E2' -> '250'
        return (
          (negative ? '-' : '') + digits + '0'.repeat(point - digits.length)
        );
      }
    } else if (
      !firstIsZero &&
      !lastIsZero &&
      (!truncate || digits.length - point <= dp)
    ) {
      // e.g. '1.5e2' -> '150'
      return (
        (negative ? '-' : '') +
        digits.slice(0, point) +
        '.' +
        digits.slice(point)
      );
    }

    // General exponent handling: shift the point, then run the shared tail.
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
    return finishNormalize(
      intPart,
      fracPart,
      negative,
      truncate,
      dp,
      hasNonZero,
    );
  } else if (i === length) {
    // Plain decimal: compute every normalization decision by index over the
    // original string, allocating only the final result slices.
    const fracCut = truncate ? Math.min(fracLen, dp) : fracLen;
    let fracEnd = fracStart + fracCut;
    while (fracEnd > fracStart && amount.charCodeAt(fracEnd - 1) === CHAR_0) {
      fracEnd -= 1;
    }
    const intIsZero = intIsAllZero;
    if (intIsZero && fracEnd === fracStart) {
      // BigNumber drops the sign for a value that parsed as exactly zero
      // ('-0.000' -> '0'), but keeps it when a nonzero value is truncated
      // toward zero to zero ('-0.5' at 0 decimals -> '-0').
      if (negative && hasNonZero) {
        return '-0';
      }
      return '0';
    }
    const intStr =
      intDigits === 0
        ? '0'
        : amount.slice(intStart + intZeroEnd, intStart + intLen);
    if (fracEnd === fracStart) {
      return negative ? `-${intStr}` : intStr;
    }
    const fracStr = amount.slice(fracStart, fracEnd);
    return negative ? `-${intStr}.${fracStr}` : `${intStr}.${fracStr}`;
  }
  return undefined; // Trailing junk — defer to BigNumber.
}

/**
 * Shared normalization tail for the general (non-fast-exit) paths: truncate
 * fractional digits to `dp`, strip leading integer zeros, trim trailing
 * fractional zeros, and apply BigNumber's zero-sign rule.
 */
function finishNormalize(
  intPart: string,
  fracPart: string,
  negative: boolean,
  truncate: boolean,
  dp: number,
  hasNonZero: boolean,
): string {
  // Truncate fractional digits to the asset's precision (round toward zero).
  if (truncate && fracPart.length > dp) {
    fracPart = fracPart.slice(0, dp);
  }

  // Strip leading integer zeros, keeping a single digit ('007' -> '7').
  let intZeroEnd = 0;
  while (
    intZeroEnd < intPart.length - 1 &&
    intPart.charCodeAt(intZeroEnd) === CHAR_0
  ) {
    intZeroEnd += 1;
  }
  if (intZeroEnd > 0) {
    intPart = intPart.slice(intZeroEnd);
  }

  // Trim trailing fractional zeros ('1.500' -> '1.5', '1.000' -> '1').
  let fracEnd = fracPart.length;
  while (fracEnd > 0 && fracPart.charCodeAt(fracEnd - 1) === CHAR_0) {
    fracEnd -= 1;
  }

  const intIsZero =
    intPart.length <= 1 && (intPart === '' || intPart.charCodeAt(0) === CHAR_0);
  if (intIsZero && fracEnd === 0) {
    // BigNumber drops the sign for a value that parsed as exactly zero
    // ('-0.000' -> '0'), but keeps it when a nonzero value is truncated
    // toward zero to zero ('-0.5' at 0 decimals -> '-0').
    if (negative && hasNonZero) {
      return '-0';
    }
    return '0';
  }
  if (intPart === '') {
    intPart = '0'; // e.g. '.5' -> '0.5'
  }
  const fracNorm =
    fracEnd === fracPart.length ? fracPart : fracPart.slice(0, fracEnd);
  if (fracNorm === '') {
    return negative ? `-${intPart}` : intPart;
  }
  return negative ? `-${intPart}.${fracNorm}` : `${intPart}.${fracNorm}`;
}

/**
 * The original BigNumber-based normalization, kept verbatim as the fallback
 * for whitespace-padded, radix-prefixed, oversized-exponent and other
 * non-plain inputs. It parses with the live global BigNumber config, so it
 * is the source of truth for any behavior that depends on configuration.
 */
function normalizeWithBigNumber(amount: string, decimals?: number): string {
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
