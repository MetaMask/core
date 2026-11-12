import type { TransactionMeta } from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger.js';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import {
  getEIP7702UpgradeContractAddress,
  isServerValidationEnabled,
} from '../../utils/feature-flags.js';
import { GasPaymentMode } from '../../utils/gas-payment.js';
import { isMpcMoneyAccountPayer } from '../../utils/account.js';
import {
  buildPolymarketDepositWalletSimulation,
  isPredictWithdraw,
} from '../../utils/polymarket/withdraw.js';
import {
  build7702BatchSimulation,
  buildCallsSimulation,
  buildDelegationSimulation,
} from '../../utils/simulation.js';
import type { QuoteSimulation } from '../../utils/simulation.js';
import { validateQuotes } from '../../utils/validation.js';
import { getServerDepositData } from './deposit-step.js';
import {
  getServerExecuteDelegation,
  getServerGasPayment,
  getServerSubmitParams,
} from './server-submit.js';
import type { ServerQuote } from './types.js';

const log = createModuleLogger(projectLogger, 'server-validation');

export type ValidateServerQuotesRequest = {
  messenger: TransactionPayControllerMessenger;
  quotes: TransactionPayQuote<ServerQuote>[];
  signal?: AbortSignal;
  transaction: TransactionMeta;
};

/**
 * Validate server quotes by checking the live source balance and simulating
 * the transactions each quote would submit on the source chain.
 *
 * Gated by the `payStrategies.server.validationEnabled` feature flag.
 *
 * @param request - Validation request.
 */
export async function validateServerQuotes(
  request: ValidateServerQuotesRequest,
): Promise<void> {
  const { messenger, quotes, signal, transaction } = request;

  if (!isServerValidationEnabled(messenger, transaction)) {
    return;
  }

  await validateQuotes({
    buildSimulation: async (quote) =>
      shouldSkipValidation(quote, transaction, messenger)
        ? undefined
        : await buildServerSimulation(quote, messenger, transaction),
    messenger,
    quotes,
    signal,
  });
}

function shouldSkipValidation(
  quote: TransactionPayQuote<ServerQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
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

  if (!quote.original.steps.some((step) => step.type === 'transaction')) {
    log('Skipping quote validation: no transaction steps', {
      from: request.from,
    });
    return true;
  }

  // Simulation rebuilds the submit calls, which signs a delegation through the
  // client payment-override callback. Skip that for an MPC Money payer so
  // quote refresh does not prompt for MFA ahead of the real submit.
  if (isMpcMoneyAccountPayer(messenger, request)) {
    log('Skipping quote validation: MPC Money account payer', {
      from: request.from,
      refundTo: request.refundTo,
    });
    return true;
  }

  return false;
}

async function buildServerSimulation(
  quote: TransactionPayQuote<ServerQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<QuoteSimulation> {
  const { from, sourceChainId, targetChainId } = quote.request;
  const context = { from, sourceChainId, targetChainId };

  if (quote.request.isPolymarketDepositWallet) {
    log('Building deposit wallet simulation', context);

    return await buildPolymarketDepositWalletSimulation({
      depositData: getServerDepositData(quote.original),
      from,
      messenger,
      sourceAmountRaw: quote.sourceAmount.raw,
    });
  }

  const params = await getServerSubmitParams(quote, messenger, transaction);
  const gasPayment = getServerGasPayment(quote, messenger, transaction);

  if (gasPayment.mode === GasPaymentMode.Delegation) {
    log('Building execute simulation', context);

    const delegation = await getServerExecuteDelegation(
      quote,
      params,
      messenger,
      transaction,
    );

    return buildDelegationSimulation({ ...delegation, from });
  }

  if (params.length > 1 && quote.original.client.is7702) {
    log('Building 7702 batch simulation', context);

    // The batch is an ERC-7821 `execute` on the sender's own account, so an
    // authorization is always included as the live upgrade state is unknown.
    // The gas limit is omitted since it was estimated without an
    // authorization for accounts that are already upgraded.
    return build7702BatchSimulation({
      authorizationAddress: getEIP7702UpgradeContractAddress(
        messenger,
        sourceChainId,
      ),
      calls: params,
      from,
    });
  }

  log('Building normal simulation', context);

  return buildCallsSimulation(params);
}
