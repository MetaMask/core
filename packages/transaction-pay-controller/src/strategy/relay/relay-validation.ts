import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger.js';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import {
  getEIP7702UpgradeContractAddress,
  isRelayValidationEnabled,
} from '../../utils/feature-flags.js';
import {
  buildPolymarketDepositWalletSimulation,
  isPredictWithdraw,
} from '../../utils/polymarket/withdraw.js';
import {
  build7702BatchSimulation,
  buildCallsSimulation,
  buildDelegationSimulation,
  validateQuotes,
} from '../../utils/quote-validation.js';
import type { QuoteSimulation } from '../../utils/validation.js';
import { getRelayDepositData } from './deposit-step.js';
import { getRelayExecuteRequest } from './relay-submit-execute.js';
import { getRelaySubmitCalls } from './relay-submit.js';
import type { RelayExecuteRequest, RelayQuote } from './types.js';

const log = createModuleLogger(projectLogger, 'relay-validation');

export type ValidateRelayQuotesRequest = {
  messenger: TransactionPayControllerMessenger;
  quotes: TransactionPayQuote<RelayQuote>[];
  signal?: AbortSignal;
  transaction: TransactionMeta;
};

export async function validateRelayQuotes(
  request: ValidateRelayQuotesRequest,
): Promise<void> {
  if (!isRelayValidationEnabled(request.messenger, request.transaction)) {
    return;
  }

  await validateQuotes({
    buildSimulation: async (quote) =>
      shouldSkipValidation(quote, request.transaction)
        ? undefined
        : await buildValidationSimulation(request, quote),
    messenger: request.messenger,
    quotes: request.quotes,
    signal: request.signal,
  });
}

function shouldSkipValidation(
  quote: TransactionPayQuote<RelayQuote>,
  transaction: TransactionMeta,
): boolean {
  const { request } = quote;

  if (request.isHyperliquidSource) {
    log('Skipping quote validation: Hyperliquid source', {
      from: request.from,
    });
    return true;
  }

  // Legacy Safe Predict withdraws convert USDC.e to pUSD outside the calls the
  // controller can see, so they cannot be faithfully simulated and are skipped.
  if (
    isPredictWithdraw(request, transaction) &&
    !request.isPolymarketDepositWallet
  ) {
    log('Skipping quote validation: legacy Safe Predict withdraw', {
      from: request.from,
    });
    return true;
  }

  return false;
}

async function buildValidationSimulation(
  request: ValidateRelayQuotesRequest,
  quote: TransactionPayQuote<RelayQuote>,
): Promise<QuoteSimulation> {
  if (quote.request.isPolymarketDepositWallet) {
    return await buildPolymarketDepositWalletSimulation({
      depositData: getRelayDepositData(quote.original),
      from: quote.request.from,
      messenger: request.messenger,
      sourceAmountRaw: quote.sourceAmount.raw,
    });
  }

  const { calls } = await getRelaySubmitCalls({
    messenger: request.messenger,
    quote,
    transaction: request.transaction,
  });

  const executeRequest = quote.original.metamask.isExecute
    ? await getRelayExecuteRequest({
        allParams: calls,
        messenger: request.messenger,
        quote,
        requestId: quote.original.steps[0].requestId,
        transaction: request.transaction,
      })
    : undefined;

  return buildRelayValidationSimulation(
    request.messenger,
    quote,
    calls,
    executeRequest,
  );
}

function buildRelayValidationSimulation(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<RelayQuote>,
  calls: TransactionParams[],
  executeRequest?: Omit<RelayExecuteRequest, 'metamask'>,
): QuoteSimulation {
  const { from, sourceChainId, targetChainId } = quote.request;
  const context = { from, sourceChainId, targetChainId };

  if (executeRequest) {
    log('Building execute simulation', context);
    return buildRelayExecuteSimulation(quote, executeRequest);
  }
  if (quote.original.metamask.is7702) {
    log('Building 7702 batch simulation', context);
    return buildRelay7702BatchSimulation(messenger, quote, calls);
  }
  log('Building normal simulation', context);
  return buildCallsSimulation(calls);
}

function buildRelayExecuteSimulation(
  quote: TransactionPayQuote<RelayQuote>,
  executeRequest: Omit<RelayExecuteRequest, 'metamask'>,
): QuoteSimulation {
  const { authorizationList, data, to, value } = executeRequest.data;
  const valueHex = new BigNumber(value).toString(16).replace(/^/u, '0x') as Hex;

  return buildDelegationSimulation({
    authorizationList,
    data,
    from: quote.request.from,
    to,
    value: valueHex,
  });
}

function buildRelay7702BatchSimulation(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<RelayQuote>,
  calls: TransactionParams[],
): QuoteSimulation {
  const { from, sourceChainId } = quote.request;

  // The batch call is an ERC-7821 `execute` on the sender's own account, so the
  // account must appear upgraded for the simulation to succeed. The quote does
  // not always carry an authorization, and there is no fast way to check the
  // live upgrade state, so an authorization is always included: the delegator
  // address comes from the quote when present, otherwise from the configured
  // EIP-7702 upgrade contract for the chain.
  const authorizationAddress =
    quote.original.request.authorizationList?.[0]?.address ??
    getEIP7702UpgradeContractAddress(messenger, sourceChainId);

  return build7702BatchSimulation({
    authorizationAddress,
    calls,
    from,
    gas: quote.original.metamask.gasLimits[0],
  });
}
