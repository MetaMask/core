import { isHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  BASIS_POINTS_DIVISOR,
  BUILDER_FEE_CONFIG,
} from '../constants/hyperLiquidConfig.js';
import {
  SUBSCRIPTION_CLOID_CONFIG,
  SUBSCRIPTION_CLOID_FLAGS,
} from '../constants/perpsConfig.js';
import type {
  FeeCalculationResult,
  PerpsFeeResolution,
  PerpsSubscriptionFeeWaiverStatus,
} from '../types/index.js';

/**
 * How much of an order the subscription allowance covered.
 *
 * - `full` — the remaining allowance covered the whole order notional, so the
 *   MetaMask builder fee is waived outright.
 * - `partial` — the allowance covered part of the order, so the fee is charged
 *   on the uncovered share only.
 * - `none` — the gate did not pass, so subscription contributes no rate.
 */
export type PerpsSubscriptionWaiverKind = 'full' | 'partial' | 'none';

/**
 * The subscription source's contribution to the unified fee comparison.
 */
export type PerpsSubscriptionWaiverRate = {
  /** Whether the subscription source produced a usable rate at all. */
  applies: boolean;

  /** Effective MetaMask builder fee in basis points under the waiver. */
  feeBips: number;

  /** How much of the order the allowance covered. */
  kind: PerpsSubscriptionWaiverKind;

  /** Order notional (USD) the allowance actually covered, when bounded. */
  coveredNotionalUsd?: number;
};

/**
 * Resolve the subscription source's effective fee rate for one order.
 *
 * ADR 0064 replaces the binary 0-bips waiver with a blended rate:
 *
 * - `remaining >= orderNotional` → `0` bips; the allowance covers the order.
 * - `0 < remaining < orderNotional` → `maxFeeBips * (1 - remaining/orderNotional)`;
 *   the fee is charged only on the share the allowance did not cover.
 * - `remaining <= 0` → the allowance is spent, so the source does not apply.
 *
 * An absent `remainingNotionalUsd` means the backend did not bound the
 * allowance, which stays a full waiver — the pre-existing behavior for an
 * eligible gate that reports no cap.
 *
 * A *bounded* allowance with an absent or non-positive `orderNotionalUsd` does
 * not apply at all. Quoting the full waiver there would charge nothing on an
 * order whose size is unknown and silently over-consume the cap; withholding is
 * the fail-closed direction, and the same one an exhausted or stale gate takes.
 * A rate-only preview of a bounded allowance therefore quotes the next-lowest
 * source rather than a waiver the order may not receive.
 *
 * Pure, so preview and submit consume exactly the same arithmetic and their
 * quoted and charged fees cannot drift.
 *
 * @param params - The inputs to the blended-rate formula.
 * @param params.status - The subscription eligibility gate outcome.
 * @param params.maxFeeBips - The default MetaMask builder fee, in basis points.
 * @param params.orderNotionalUsd - Order notional (USD), when the caller knows it.
 * @returns The subscription source's effective rate and how much it covered.
 */
export function resolveSubscriptionWaiverRate(params: {
  status: PerpsSubscriptionFeeWaiverStatus;
  maxFeeBips: number;
  orderNotionalUsd?: number;
}): PerpsSubscriptionWaiverRate {
  const { status, maxFeeBips, orderNotionalUsd } = params;

  if (!status.eligible) {
    return { applies: false, feeBips: maxFeeBips, kind: 'none' };
  }

  const remaining = status.remainingNotionalUsd;

  // The backend reported no bound on the allowance, so nothing limits it.
  if (remaining === undefined) {
    return { applies: true, feeBips: 0, kind: 'full' };
  }

  if (!Number.isFinite(remaining) || remaining <= 0) {
    // A reported allowance of zero is spent, whatever the gate said.
    return { applies: false, feeBips: maxFeeBips, kind: 'none' };
  }

  // A bounded allowance with no notional to measure it against cannot be
  // honoured: granting the full waiver would charge nothing on an order of
  // unknown size and over-consume the cap. Withholding is the fail-closed
  // direction, and matches how an exhausted or stale gate already behaves.
  if (
    orderNotionalUsd === undefined ||
    !Number.isFinite(orderNotionalUsd) ||
    orderNotionalUsd <= 0
  ) {
    return { applies: false, feeBips: maxFeeBips, kind: 'none' };
  }

  if (remaining >= orderNotionalUsd) {
    return {
      applies: true,
      feeBips: 0,
      kind: 'full',
      coveredNotionalUsd: orderNotionalUsd,
    };
  }

  return {
    applies: true,
    feeBips: maxFeeBips * (1 - remaining / orderNotionalUsd),
    kind: 'partial',
    coveredNotionalUsd: remaining,
  };
}

/**
 * Tenths of a basis point in one unit rate.
 *
 * `MaxFeeTenthsBps` is `MaxFeeDecimal * 100000`, so dividing a tenths-of-a-bip
 * figure by this returns the same decimal rate the fee quote reports.
 */
const BUILDER_FEE_TENTHS_BPS_PER_UNIT = 100_000;

/** Hex index of the flag byte inside a cloid string (after `0x` + 4 bytes). */
const FLAG_BYTE_START = 2 + SUBSCRIPTION_CLOID_CONFIG.ProgramIdHexLength;

/** Full length of a venue cloid string: `0x` plus 16 bytes of hex. */
const CLOID_HEX_LENGTH = 34;

/** A well-formed venue cloid: `0x` followed by exactly 32 hex characters. */
const CLOID_PATTERN = /^0x[0-9a-f]{32}$/u;

/**
 * Read the flag byte out of a cloid.
 *
 * @param clientOrderId - A venue client order ID, or nothing.
 * @returns The flag byte, or undefined when the id is not a well-formed cloid.
 */
export function readSubscriptionCloidFlags(
  clientOrderId: string | null | undefined,
): number | undefined {
  const normalized = clientOrderId?.toLowerCase();
  // The whole id must be well-formed hex, not merely the right length: a byte
  // like `1z` parses as 1 under `parseInt`, so a malformed id would otherwise
  // report whichever flags its leading digit happens to encode.
  if (normalized === undefined || !CLOID_PATTERN.test(normalized)) {
    return undefined;
  }
  return Number.parseInt(
    normalized.slice(FLAG_BYTE_START, FLAG_BYTE_START + 2),
    16,
  );
}

/**
 * Whether a cloid declares that a subscription fee reduction was applied.
 *
 * This is what the fill fan-out decodes downstream, so it is the honest
 * definition of "marked": the program marker alone does not mean a reduction
 * was charged.
 *
 * **The flag byte is only trusted behind the subscription program marker.** An
 * arbitrary cloid has no reserved flag byte, so reading one out of it is
 * meaningless — and a Scale ladder placed before this release is worse than
 * meaningless: `createScaleOrderIdentity` only began zeroing that byte in this
 * change, so historical rungs carry random entropy there and roughly half of
 * them decode as waived if the byte is read on the Scale marker alone. The
 * program marker is the one prefix no previously released client ever emitted,
 * which is what makes this safe to point at historical fills.
 *
 * The consequence is that a **marked Scale rung reads as unwaived here**: it
 * keeps its Scale marker so group recovery and cancel-by-cloid keep working, and
 * therefore cannot be told apart from a legacy rung by its bytes alone. A
 * decoder that needs Scale attribution has to correlate on something other than
 * the cloid, or wait for a ladder layout that carries a version.
 *
 * The marker it checks is {@link SUBSCRIPTION_CLOID_CONFIG.ProgramId}, the
 * registered perps-subscription program id.
 *
 * @param clientOrderId - A venue client order ID, or nothing.
 * @returns True when the `fee_reduction_applied` flag is set behind the
 * subscription program marker.
 */
export function hasFeeReductionAppliedFlag(
  clientOrderId: string | null | undefined,
): boolean {
  if (!isSubscriptionProgramCloid(clientOrderId)) {
    return false;
  }
  const flags = readSubscriptionCloidFlags(clientOrderId);
  return (
    flags !== undefined &&
    isFlagSet(flags, SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied)
  );
}

/**
 * Whether one bit of a flag byte is set.
 *
 * Written arithmetically rather than with a bitwise `&`: the flag byte is a
 * small unsigned integer, so shifting the bit into place and reading its parity
 * is exact, and it keeps this file free of bitwise operators the repo's lint
 * rules disallow.
 *
 * @param flags - The flag byte read out of a cloid.
 * @param bit - The single-bit flag value to test, e.g. `0x01`.
 * @returns True when that bit is set.
 */
function isFlagSet(flags: number, bit: number): boolean {
  return Math.floor(flags / bit) % 2 === 1;
}

/**
 * Whether a cloid carries the subscription program marker in its leading bytes.
 *
 * Only orders that had no cloid of their own get the program marker; an order
 * that already carried one (a Scale rung) keeps its own leading marker and
 * carries the subscription attribution in the flag byte instead. Decoders
 * should therefore key on {@link hasFeeReductionAppliedFlag}, and use this only
 * to tell the two layouts apart.
 *
 * @param clientOrderId - A venue client order ID, or nothing.
 * @returns True when the cloid starts with the subscription program id.
 */
export function isSubscriptionProgramCloid(
  clientOrderId: string | null | undefined,
): boolean {
  const normalized = clientOrderId?.toLowerCase();
  // Hex-validated for the same reason the flag reader is: a length-and-prefix
  // check would accept an id whose remaining bytes are not hex at all, and this
  // predicate is what gates the decoder.
  return Boolean(
    normalized &&
      CLOID_PATTERN.test(normalized) &&
      normalized.startsWith(`0x${SUBSCRIPTION_CLOID_CONFIG.ProgramId}`),
  );
}

/**
 * Stamp the subscription marking onto a venue client order ID.
 *
 * A cloid is 16 bytes, laid out as:
 *
 * ```
 * 0x <program marker: 4 bytes> <flags: 1 byte> <entropy: 11 bytes>
 * ```
 *
 * The flag byte sits *after* the leading marker rather than replacing it, which
 * is what lets the marking compose with the cloid the Scale ladder already
 * builds. Three cases:
 *
 * - **No existing cloid** — the leading bytes become
 *   {@link SUBSCRIPTION_CLOID_CONFIG.ProgramId} and the rest is fresh entropy.
 * - **An id this package generated**, declared by the caller through
 *   `isGenerated` (a Scale rung) — its own leading marker and its trailing bytes
 *   are preserved, and only the flag byte is set. The Scale group marker still
 *   prefixes the id, so group recovery from open orders and cancel-by-cloid keep
 *   working, and the rung index in the last byte still keeps every rung unique.
 * - **A caller-supplied `OrderParams.clientOrderId`** — returned untouched, and
 *   therefore unattributed. That id is the caller's own reconciliation,
 *   idempotency, and telemetry key: submitting a byte-altered version would hand
 *   the venue an id the caller never chose and cannot match a fill against.
 *   Losing attribution on those orders is the strictly better trade, since
 *   attribution is observability while the id is a correctness contract.
 *
 * Provenance is declared, never inferred. A leading marker cannot prove who
 * generated an id: a caller is free to supply a 16-byte cloid that happens to
 * begin with the Scale or subscription marker, and guessing from the prefix
 * would rewrite exactly the id the contract promises to preserve.
 *
 * A cloid is only ever marked when the subscription source actually won, so any
 * other fee source leaves the id exactly as the caller built it.
 *
 * @param params - The marking inputs.
 * @param params.clientOrderId - The cloid already chosen for this order, if any.
 * @param params.isGenerated - True only when `clientOrderId` was generated by
 * this package and may therefore be re-stamped. Defaults to false, so an id of
 * unknown provenance is preserved rather than rewritten.
 * @param params.entropy - Hex entropy used when there is no existing cloid.
 * @returns The marked cloid, or the caller's own id unchanged.
 */
export function markSubscriptionCloid(params: {
  clientOrderId?: string;
  isGenerated?: boolean;
  entropy: string;
}): Hex {
  const { clientOrderId, isGenerated = false, entropy } = params;
  const flags = SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied.toString(
    16,
  ).padStart(2, '0');

  let body: string;
  if (clientOrderId !== undefined && !isGenerated) {
    // Not ours to rewrite: hand it back exactly as supplied and forgo
    // attribution.
    if (!isHexString(clientOrderId)) {
      throw new Error('Client order ID is not a hex string');
    }
    return clientOrderId as Hex;
  } else if (clientOrderId?.length === CLOID_HEX_LENGTH) {
    const existing = clientOrderId.slice(2).toLowerCase();
    // Keep the generated marker and trailing bytes; claim only the flag byte.
    body = `${existing.slice(0, SUBSCRIPTION_CLOID_CONFIG.ProgramIdHexLength)}${flags}${existing.slice(
      SUBSCRIPTION_CLOID_CONFIG.ProgramIdHexLength + 2,
    )}`;
  } else {
    const suffix = entropy
      .toLowerCase()
      .replace(/[^0-9a-f]/gu, '')
      .slice(0, SUBSCRIPTION_CLOID_CONFIG.EntropyHexLength)
      .padEnd(SUBSCRIPTION_CLOID_CONFIG.EntropyHexLength, '0');
    body = `${SUBSCRIPTION_CLOID_CONFIG.ProgramId}${flags}${suffix}`;
  }

  const marked: Hex = `0x${body}`;

  if (!isHexString(marked) || marked.length !== CLOID_HEX_LENGTH) {
    throw new Error('Failed to mark subscription client order ID');
  }

  return marked;
}

/**
 * The MetaMask builder fee a discount actually buys, in tenths of a basis point.
 *
 * HyperLiquid's builder fee is an integer number of tenths of a basis point, so
 * the venue floors whatever fraction a discount implies. Both preview and submit
 * resolve the charged fee through here: quoting the unfloored fraction would
 * promise a rate the venue cannot charge — a 6.667-bip blend is submitted as
 * 6.6 — and the difference, though always in the user's favour, is a
 * quote-versus-charge mismatch of exactly the kind this change set out to close.
 *
 * @param discountBips - Discount off the default builder fee, in basis points.
 * @returns The charged builder fee in tenths of a basis point.
 */
export function quantizeBuilderFeeTenthsBps(discountBips: number): number {
  return Math.floor(
    BUILDER_FEE_CONFIG.MaxFeeTenthsBps *
      (1 - discountBips / BASIS_POINTS_DIVISOR),
  );
}

/**
 * Re-price a fee quote from the unified fee resolution./**
 * Re-price a fee quote from the unified fee resolution.
 *
 * The provider quotes the MetaMask component from whatever discount the last
 * submit pushed into it, which knows nothing about the notional being quoted.
 * The resolver does, so the preview replaces the MetaMask component with the
 * resolved rate and rebuilds the total from it. That is what makes a quoted
 * blended fee equal the fee the order will actually be charged.
 *
 * A quote whose placement carries no builder fee at all (`metamaskFeeRate` of
 * `0`, e.g. TWAP) is left alone: there is no MetaMask fee to discount.
 *
 * @param params - The re-pricing inputs.
 * @param params.fees - The provider's fee quote.
 * @param params.resolution - The unified fee resolution, when one was computed.
 * @param params.amount - Order notional (USD) as a string, when provided.
 * @param params.chargesNoBuilderFee - True when this placement carries no
 * MetaMask builder fee at all (a TWAP, for instance). Distinguishes a genuine
 * zero from the zero a concurrent fully-waived submit leaves in provider state.
 * @returns The quote with its MetaMask component and totals re-priced.
 */
export function applyFeeResolution(params: {
  fees: FeeCalculationResult;
  resolution: PerpsFeeResolution | undefined;
  amount?: string;
  chargesNoBuilderFee?: boolean;
}): FeeCalculationResult {
  const { fees, resolution, amount, chargesNoBuilderFee = false } = params;

  if (resolution === undefined || fees.metamaskFeeRate === undefined) {
    return fees;
  }

  // A provider rate of zero is not proof that this placement carries no builder
  // fee: it is also what a concurrent fully-waived submit leaves behind in
  // provider state. Distinguish the two by asking the policy, not the leftover
  // number — otherwise an ordinary preview inherits someone else's waiver.
  if (fees.metamaskFeeRate === 0 && chargesNoBuilderFee) {
    return fees;
  }

  // An unresolved discount means the `default` source won, which is a real
  // answer of "no reduction" — not "leave the provider's number alone". The
  // provider's rate reflects whatever discount the last submit pushed into it,
  // so a concurrent order could otherwise leak its discount into this quote.
  const discountBips = resolution.discountBips ?? 0;

  // Quantized exactly as the venue will charge it, so the quote matches the
  // fill rather than the unfloored fraction the discount implies.
  const metamaskFeeRate =
    quantizeBuilderFeeTenthsBps(discountBips) / BUILDER_FEE_TENTHS_BPS_PER_UNIT;
  const parsedAmount =
    amount === undefined ? undefined : Number.parseFloat(amount);
  // A non-positive notional is not an order size, and recomputing from it would
  // quote a negative fee. The rates are still re-priced; only the amounts are
  // left as the provider reported them.
  const notional =
    parsedAmount !== undefined &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0
      ? parsedAmount
      : undefined;

  const protocolFeeRate = fees.protocolFeeRate ?? 0;
  const feeRate = protocolFeeRate + metamaskFeeRate;

  return {
    ...fees,
    metamaskFeeRate,
    feeRate,
    ...(notional !== undefined && {
      metamaskFeeAmount: notional * metamaskFeeRate,
      feeAmount: notional * feeRate,
    }),
  };
}
