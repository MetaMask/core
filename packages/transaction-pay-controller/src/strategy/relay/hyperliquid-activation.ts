import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { HYPERCORE_USDC_DECIMALS } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../types';
import { getHyperliquidActivationFeeConfig } from '../../utils/feature-flags';
import { HYPERLIQUID_INFO_URL } from './constants';

const log = createModuleLogger(projectLogger, 'hyperliquid-activation');

/**
 * HyperLiquid non-funding ledger `delta` types that represent a spot-lane
 * transfer. Bridge withdrawals (`withdraw`) are deliberately excluded: they
 * use a separate fee lane and do not settle the spot activation fee, so an
 * account whose only outbound history is bridge withdrawals still pays the
 * activation fee on its first spot send.
 */
const OUTBOUND_TRANSFER_TYPES = new Set(['send', 'spotTransfer']);

/**
 * The activation fee is 1 quote token (e.g. 1 USDC). Ledger entries with a
 * `fee` at or above this mark the account's activation as paid; smaller fees
 * (e.g. HIP-3 dex transfer fees) do not.
 */
const ACTIVATION_FEE_MINIMUM = 1;

/**
 * Minimal shape of a HyperLiquid `userNonFundingLedgerUpdates` entry. Only the
 * fields used to determine activation are typed.
 */
export type HyperLiquidLedgerUpdate = {
  time?: number;
  delta?: {
    type?: string;
    user?: string;
    destination?: string;
    fee?: string;
  };
};

/**
 * Whether a single ledger entry is an outbound spot transfer initiated by the
 * account.
 *
 * @param update - The ledger entry.
 * @param normalizedAddress - The account's lowercased address.
 * @returns True when the account itself sent funds out via the spot lane.
 */
function isOutboundFromAccount(
  update: HyperLiquidLedgerUpdate,
  normalizedAddress: string,
): boolean {
  const delta = update?.delta;

  if (!delta?.type || !OUTBOUND_TRANSFER_TYPES.has(delta.type)) {
    return false;
  }

  // A spot send/transfer counts only when this account is the sender and the
  // funds leave it (an inbound receipt has `user` set to the other party).
  const sender = delta.user?.toLowerCase();
  const destination = delta.destination?.toLowerCase();
  return sender === normalizedAddress && destination !== normalizedAddress;
}

/**
 * Whether the account was created by an inbound transfer that paid the
 * activation fee on its behalf.
 *
 * When a transfer creates a new HyperCore account, HyperLiquid charges the
 * activation fee on that transfer and records it on the entry's `fee`. Such
 * accounts send for free from their very first outbound transfer. The fee is
 * only meaningful on the account's earliest entry: a later inbound entry with
 * a fee belongs to the sender (their own first-send activation), not to this
 * account.
 *
 * @param updates - Raw HyperLiquid non-funding ledger updates.
 * @returns True when the account's creation entry carries the activation fee.
 */
function hasPaidActivationOnCreation(
  updates: HyperLiquidLedgerUpdate[],
): boolean {
  const firstUpdate = updates.reduce(
    (earliest: HyperLiquidLedgerUpdate | undefined, update) =>
      earliest === undefined || (update.time ?? 0) < (earliest.time ?? 0)
        ? update
        : earliest,
    undefined,
  );

  const fee = parseFloat(firstUpdate?.delta?.fee ?? '');

  return Number.isFinite(fee) && fee >= ACTIVATION_FEE_MINIMUM;
}

/**
 * Whether the HyperCore account has already paid the one-time spot activation
 * fee.
 *
 * The fee is charged once per account, either on the inbound transfer that
 * creates the account, or on top of the account's first outbound spot send if
 * activation was not paid at creation (e.g. accounts created via the Arbitrum
 * bridge or perps trading). Bridge withdrawals do not settle it. HyperLiquid
 * purges emptied accounts along with their ledger, which also resets
 * activation — an empty ledger is therefore correctly treated as unactivated.
 *
 * @param updates - Raw HyperLiquid non-funding ledger updates.
 * @param address - The account's address.
 * @returns True when the account's activation fee is already paid.
 */
export function isHyperLiquidAccountActivated(
  updates: HyperLiquidLedgerUpdate[],
  address: string,
): boolean {
  if (!address) {
    return false;
  }

  const normalizedAddress = address.toLowerCase();

  return (
    hasPaidActivationOnCreation(updates) ||
    updates.some((update) => isOutboundFromAccount(update, normalizedAddress))
  );
}

/**
 * Query HyperLiquid for the account's activation state.
 *
 * On any error (network failure, non-OK response, malformed body) the account
 * is treated as unactivated so the fee is reserved. A wrongly reserved fee
 * leaves a recoverable amount on HyperLiquid, while a wrongly skipped reserve
 * makes the whole withdrawal fail with an insufficient-balance error.
 *
 * @param address - The HyperCore account address.
 * @param signal - Optional abort signal forwarded to the request.
 * @returns True when the account is confirmed activated.
 */
async function fetchIsAccountActivated(
  address: Hex,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(HYPERLIQUID_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userNonFundingLedgerUpdates',
        user: address,
        startTime: 0,
      }),
      signal,
    });

    if (!response.ok) {
      log('Activation check returned non-OK, assuming unactivated', {
        status: response.status,
      });
      return false;
    }

    const updates = (await response.json()) as HyperLiquidLedgerUpdate[];

    return isHyperLiquidAccountActivated(updates, address);
  } catch (error) {
    log('Activation check failed, assuming unactivated', { error });
    return false;
  }
}

/**
 * Reserve the one-time HyperLiquid activation fee for an unactivated HyperCore
 * source account.
 *
 * Reduces the amount sent to the provider so HyperLiquid retains enough balance
 * for the activation fee on the `sendAsset` step, and records the reserved fee
 * (USD) so it can be added to the provider fee — keeping the displayed
 * withdrawal amount unchanged.
 *
 * No-op for non-HyperLiquid sources, when the feature flag is disabled, when
 * the account is already activated, or when the amount is too small to reserve.
 *
 * @param request - Normalized quote request.
 * @param messenger - Controller messenger.
 * @param transactionType - Parent transaction type used to resolve the feature
 * flag override.
 * @param signal - Optional abort signal forwarded to the activation request.
 * @returns The (possibly adjusted) quote request.
 */
export async function applyHyperliquidActivationFee(
  request: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
  transactionType?: string,
  signal?: AbortSignal,
): Promise<QuoteRequest> {
  if (!request.isHyperliquidSource) {
    return request;
  }

  const { enabled, amountUsd } = getHyperliquidActivationFeeConfig(
    messenger,
    transactionType,
  );

  if (!enabled) {
    return request;
  }

  const activated = await fetchIsAccountActivated(request.from, signal);

  if (activated) {
    return request;
  }

  const feeRaw = new BigNumber(amountUsd).shiftedBy(HYPERCORE_USDC_DECIMALS);
  const reducedAmount = new BigNumber(request.sourceTokenAmount).minus(feeRaw);

  // Can't reserve more than the balance — let the original amount through so
  // the existing HyperLiquid error surfaces (withdrawable <= activation fee).
  if (reducedAmount.lte(0)) {
    log('Skipping activation reserve as amount is not greater than fee', {
      sourceTokenAmount: request.sourceTokenAmount,
      feeRaw: feeRaw.toFixed(0),
    });
    return request;
  }

  log('Reserving HyperLiquid activation fee', {
    amountUsd,
    originalSourceTokenAmount: request.sourceTokenAmount,
    reducedSourceTokenAmount: reducedAmount.toFixed(0),
  });

  return {
    ...request,
    sourceTokenAmount: reducedAmount.toFixed(0),
    hyperliquidActivationFeeUsd: String(amountUsd),
  };
}
