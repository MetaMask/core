import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { HYPERCORE_USDC_DECIMALS } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../types.js';
import { getHyperliquidMaxBufferConfig } from '../../utils/feature-flags.js';
import { HYPERLIQUID_INFO_URL } from './constants.js';

const log = createModuleLogger(projectLogger, 'hyperliquid-max-buffer');

/**
 * Minimal shape of a HyperLiquid `clearinghouseState` response. Only the
 * fields used to size the buffer are typed.
 */
type HyperLiquidClearinghouseState = {
  assetPositions?: {
    position?: {
      positionValue?: string;
    };
  }[];
};

/**
 * Reserve a safety buffer on a Max HyperLiquid withdrawal while the account
 * has open perps positions.
 *
 * HyperLiquid's `withdrawable` is not a stored balance. It is recomputed on
 * every mark-price tick as `accountValue - max(initialMargin, 10% of open
 * notional)`, so any open position makes it move. A Max withdrawal sends the
 * exact `withdrawable` read when the user pressed Max; by the time the
 * `sendAsset` step lands (seconds to minutes later), a small adverse price
 * move, a funding payment, or a fill can push `withdrawable` below that
 * amount and HyperLiquid rejects the transfer with
 * `Insufficient balance for token transfer`.
 *
 * Reducing the amount by a fraction of the open notional absorbs that drift.
 * Accounts without open positions have a static `withdrawable`, so they are
 * left untouched and can still withdraw the full balance.
 *
 * No-op unless this is a Max withdrawal from HyperLiquid and the feature flag
 * is enabled. If the position lookup fails, the request is passed through
 * unchanged — the existing behaviour.
 *
 * @param request - Normalized quote request (amount in HyperCore decimals).
 * @param messenger - Controller messenger.
 * @param transaction - Parent transaction used to resolve flag overrides.
 * @param signal - Optional abort signal forwarded to the HyperLiquid request.
 * @returns The (possibly reduced) quote request.
 */
export async function applyHyperliquidMaxBuffer(
  request: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
  transaction?: TransactionMeta,
  signal?: AbortSignal,
): Promise<QuoteRequest> {
  if (!request.isHyperliquidSource || !request.isMaxAmount) {
    return request;
  }

  const { enabled, notionalPercent, minimumUsd } =
    getHyperliquidMaxBufferConfig(messenger, transaction?.type);

  if (!enabled) {
    return request;
  }

  const openNotionalUsd = await fetchOpenNotionalUsd(request.from, signal);

  if (openNotionalUsd === undefined || openNotionalUsd.lte(0)) {
    return request;
  }

  const bufferUsd = BigNumber.max(
    openNotionalUsd.multipliedBy(notionalPercent).dividedBy(100),
    minimumUsd,
  );

  const bufferRaw = bufferUsd
    .shiftedBy(HYPERCORE_USDC_DECIMALS)
    .integerValue(BigNumber.ROUND_UP);

  const reducedAmount = new BigNumber(request.sourceTokenAmount).minus(
    bufferRaw,
  );

  // A buffer larger than the balance means the account is almost entirely
  // committed as margin. Let the original amount through so HyperLiquid
  // surfaces its own error instead of quoting a zero/negative amount.
  if (reducedAmount.lte(0)) {
    log('Skipping max buffer as amount is not greater than buffer', {
      sourceTokenAmount: request.sourceTokenAmount,
      bufferRaw: bufferRaw.toFixed(0),
    });
    return request;
  }

  log('Reserving HyperLiquid max buffer for open positions', {
    openNotionalUsd: openNotionalUsd.toString(10),
    bufferUsd: bufferUsd.toString(10),
    originalSourceTokenAmount: request.sourceTokenAmount,
    reducedSourceTokenAmount: reducedAmount.toFixed(0),
  });

  return {
    ...request,
    sourceTokenAmount: reducedAmount.toFixed(0),
  };
}

/**
 * Query HyperLiquid for the account's total open perps notional on the main
 * DEX, in USD.
 *
 * @param address - The HyperCore account address.
 * @param signal - Optional abort signal forwarded to the request.
 * @returns Sum of absolute position values, or `undefined` on failure.
 */
async function fetchOpenNotionalUsd(
  address: Hex,
  signal?: AbortSignal,
): Promise<BigNumber | undefined> {
  try {
    const response = await fetch(HYPERLIQUID_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: address }),
      signal,
    });

    if (!response.ok) {
      log('Clearinghouse state returned non-OK, skipping buffer', {
        status: response.status,
      });
      return undefined;
    }

    const state = (await response.json()) as HyperLiquidClearinghouseState;

    return (state.assetPositions ?? []).reduce((total, assetPosition) => {
      const value = new BigNumber(assetPosition.position?.positionValue ?? 0);
      return value.isFinite() ? total.plus(value.abs()) : total;
    }, new BigNumber(0));
  } catch (error) {
    log('Clearinghouse state fetch failed, skipping buffer', { error });
    return undefined;
  }
}
