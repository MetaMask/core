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
 * HyperLiquid non-funding ledger `delta` types that represent an outbound
 * transfer initiated by the account (and therefore pay the activation fee).
 * A funding deposit can arrive as an inbound `send`, so direction is checked
 * for transfer types via the `user`/`destination` fields.
 */
const OUTBOUND_TRANSFER_TYPES = new Set(['send', 'spotTransfer']);

/**
 * Minimal shape of a HyperLiquid `userNonFundingLedgerUpdates` entry. Only the
 * fields used to determine transfer direction are typed.
 */
export type HyperLiquidLedgerUpdate = {
  delta?: {
    type?: string;
    user?: string;
    destination?: string;
  };
};

/**
 * Whether a single ledger entry is an outbound action initiated by the account.
 *
 * @param update - The ledger entry.
 * @param normalizedAddress - The account's lowercased address.
 * @returns True when the account itself sent funds out.
 */
function isOutboundFromAccount(
  update: HyperLiquidLedgerUpdate,
  normalizedAddress: string,
): boolean {
  const delta = update?.delta;

  if (!delta?.type) {
    return false;
  }

  // Bridge withdrawals are always outbound from the account.
  if (delta.type === 'withdraw') {
    return true;
  }

  // A spot send/transfer counts only when this account is the sender and the
  // funds leave it (an inbound receipt has `user` set to the other party).
  if (OUTBOUND_TRANSFER_TYPES.has(delta.type)) {
    const sender = delta.user?.toLowerCase();
    const destination = delta.destination?.toLowerCase();
    return sender === normalizedAddress && destination !== normalizedAddress;
  }

  return false;
}

/**
 * Whether the HyperCore account has already paid the activation fee.
 *
 * The fee is charged on the account's first outbound send/withdrawal, so an
 * account that has only ever received deposits (or has no non-funding ledger
 * history) is treated as unactivated. Direction matters: only entries the
 * account itself initiated count.
 *
 * @param updates - Raw HyperLiquid non-funding ledger updates.
 * @param address - The account's address.
 * @returns True when the account has made a prior outbound transfer.
 */
export function isHyperLiquidAccountActivated(
  updates: HyperLiquidLedgerUpdate[],
  address: string,
): boolean {
  if (!address) {
    return false;
  }

  const normalizedAddress = address.toLowerCase();

  return updates.some((update) =>
    isOutboundFromAccount(update, normalizedAddress),
  );
}

/**
 * Query HyperLiquid for the account's activation state.
 *
 * On any error (network failure, non-OK response, malformed body) the account
 * is treated as activated so the common path is never penalised by a transient
 * HyperLiquid outage; an unactivated account would then surface the original
 * HyperLiquid error, matching the pre-feature behaviour.
 *
 * @param address - The HyperCore account address.
 * @param signal - Optional abort signal forwarded to the request.
 * @returns True when the account is activated (or activation can't be determined).
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
      log('Activation check returned non-OK, assuming activated', {
        status: response.status,
      });
      return true;
    }

    const updates = (await response.json()) as HyperLiquidLedgerUpdate[];

    return isHyperLiquidAccountActivated(updates, address);
  } catch (error) {
    log('Activation check failed, assuming activated', { error });
    return true;
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
