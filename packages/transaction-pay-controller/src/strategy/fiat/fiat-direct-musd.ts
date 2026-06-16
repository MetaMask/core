import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getNetworkClientId } from '../../utils/provider';
import { buildCaipAssetType } from '../../utils/token';
import { buildTokenTransferData } from '../../utils/token-transfer';
import type { RelayQuote } from '../relay/types';
import {
  DEFAULT_FIAT_CURRENCY,
  MUSD_MONAD_FIAT_ASSET,
  MUSD_PROBE_AMOUNT_USD,
} from './constants';
import type { TransactionPayFiatAsset } from './constants';

const log = createModuleLogger(projectLogger, 'fiat-direct-musd');

export type DirectMusdFiatQuoteOptions = {
  fiatAsset: TransactionPayFiatAsset;
  rampsWalletAddress: Hex;
  relayRequestOverrides: Pick<
    QuoteRequest,
    'isDirectMusdMoneyAccount' | 'recipient'
  >;
};

/**
 * Returns direct mUSD quote options when ramps can sell mUSD to the Money Account.
 *
 * @param options - Direct mUSD quote options.
 * @param options.messenger - Controller messenger.
 * @param options.moneyAccountAddress - Money Account receiving the fiat on-ramp.
 * @returns Direct quote options, or undefined when direct mUSD is unavailable.
 */
export async function getDirectMusdFiatQuoteOptions({
  messenger,
  moneyAccountAddress,
}: {
  messenger: PayStrategyGetQuotesRequest['messenger'];
  moneyAccountAddress: Hex;
}): Promise<DirectMusdFiatQuoteOptions | undefined> {
  const probeOk = await probeMusdFiatAvailability({
    messenger,
    walletAddress: moneyAccountAddress,
  });

  if (!probeOk) {
    return undefined;
  }

  return {
    fiatAsset: MUSD_MONAD_FIAT_ASSET,
    rampsWalletAddress: moneyAccountAddress,
    relayRequestOverrides: {
      isDirectMusdMoneyAccount: true,
      recipient: moneyAccountAddress,
    },
  };
}

/**
 * Detects a direct mUSD Money Account quote from its stored request marker.
 *
 * @param quote - Quote to inspect.
 * @returns True when the quote originated from the direct mUSD fiat path.
 */
export function isDirectMusdMoneyAccountQuote(
  quote: Pick<TransactionPayQuote<unknown>, 'request'> | undefined,
): boolean {
  return isDirectMusdMoneyAccountRequest(quote?.request);
}

/**
 * Detects a direct mUSD Money Account quote request.
 *
 * @param request - Quote request to inspect.
 * @returns True when the request originated from the direct mUSD fiat path.
 */
export function isDirectMusdMoneyAccountRequest(
  request: QuoteRequest | undefined,
): boolean {
  return request?.isDirectMusdMoneyAccount === true;
}

/**
 * Direct mUSD relies on Relay execute so funding and Relay settlement are atomic.
 *
 * @param quote - Relay quote to validate.
 */
export function assertDirectMusdRelayExecute(
  quote: Pick<TransactionPayQuote<RelayQuote>, 'original' | 'request'>,
): void {
  if (
    isDirectMusdMoneyAccountQuote(quote) &&
    quote.original.metamask?.isExecute !== true
  ) {
    throw new Error('Direct mUSD Money Account quotes require Relay execute');
  }
}

/**
 * Builds the delegated Money Account funding transaction for direct mUSD submit.
 *
 * @param options - Funding options.
 * @param options.messenger - Controller messenger.
 * @param options.quote - Direct mUSD Relay quote.
 * @param options.relayParams - First Relay transaction params, used for fee fields.
 * @param options.transaction - Original Money Account transaction.
 * @returns Transaction params to prepend, or undefined for non-direct quotes.
 */
export async function buildDirectMusdFundingParams({
  messenger,
  quote,
  relayParams,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  relayParams?: TransactionParams;
  transaction: TransactionMeta;
}): Promise<TransactionParams | undefined> {
  if (!isDirectMusdMoneyAccountQuote(quote)) {
    return undefined;
  }

  assertDirectMusdRelayExecute(quote);

  const moneyAccountAddress = transaction.txParams.from as Hex | undefined;

  if (!moneyAccountAddress) {
    throw new Error('Missing Money Account address for direct mUSD funding');
  }

  const networkClientId = getNetworkClientId(
    messenger,
    quote.request.sourceChainId,
  );

  const fundingTransaction = {
    ...transaction,
    chainId: quote.request.sourceChainId,
    nestedTransactions: undefined,
    networkClientId,
    txParams: {
      ...transaction.txParams,
      data: buildTokenTransferData(quote.request.from, quote.sourceAmount.raw),
      from: moneyAccountAddress,
      to: quote.request.sourceTokenAddress,
      value: '0x0',
    },
  } as TransactionMeta;

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction: fundingTransaction },
  );

  if (delegation.authorizationList?.length) {
    throw new Error(
      'Direct mUSD Money Account funding requires an already-upgraded Money Account',
    );
  }

  log('Built direct mUSD funding delegation', {
    moneyAccountAddress,
    sourceAmountRaw: quote.sourceAmount.raw,
  });

  return {
    data: delegation.data,
    from: quote.request.from,
    maxFeePerGas: relayParams?.maxFeePerGas,
    maxPriorityFeePerGas: relayParams?.maxPriorityFeePerGas,
    to: delegation.to,
    value: delegation.value,
  };
}

/**
 * Direct same-chain mUSD still needs Relay status polling because execute returns asynchronously.
 *
 * @param quote - Relay quote to inspect.
 * @returns True when same-chain polling should not be short-circuited.
 */
export function shouldForceDirectMusdRelayPolling(
  quote: Pick<TransactionPayQuote<RelayQuote>, 'request'>,
): boolean {
  return isDirectMusdMoneyAccountQuote(quote);
}

async function probeMusdFiatAvailability({
  messenger,
  walletAddress,
}: {
  messenger: PayStrategyGetQuotesRequest['messenger'];
  walletAddress: string;
}): Promise<boolean> {
  try {
    const quotes = await messenger.call('RampsController:getQuotes', {
      amount: MUSD_PROBE_AMOUNT_USD,
      assetId: buildCaipAssetType(
        MUSD_MONAD_FIAT_ASSET.chainId,
        MUSD_MONAD_FIAT_ASSET.address,
      ),
      autoSelectProvider: true,
      fiat: DEFAULT_FIAT_CURRENCY,
      restrictToKnownOrNativeProviders: true,
      walletAddress,
    });

    const isAvailable = (quotes.success?.length ?? 0) > 0;

    log('mUSD fiat probe result', {
      isAvailable,
      providerCount: quotes.success?.length ?? 0,
    });

    return isAvailable;
  } catch (error) {
    log('mUSD fiat probe failed', { error });
    return false;
  }
}
