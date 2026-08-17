import { toHex } from '@metamask/controller-utils';
import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
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
  validateQuoteExecution,
  QuoteError,
  isQuoteError,
} from '../../utils/validation.js';
import type { QuoteSimulation } from '../../utils/validation.js';
import {
  buildPolymarketDepositWalletSimulation,
  isPredictWithdraw,
} from './polymarket/withdraw.js';
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
  if (!isRelayValidationEnabled(request.messenger)) {
    return;
  }

  for (const quote of request.quotes) {
    if (shouldSkipValidation(quote, request.transaction)) {
      continue;
    }

    try {
      const simulation = await buildValidationSimulation(request, quote);

      await validateQuoteExecution({
        messenger: request.messenger,
        quote,
        signal: request.signal,
        simulation,
      });
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }
      const quoteError = toQuoteError(error);
      if (quoteError.info.reason === 'insufficient-source-balance') {
        // Backwards compatibility: keep the entire quote batch (including
        // quotes that may have passed or not yet been validated) so that
        // clients can still show quote details alongside the balance error.
        throw new QuoteError(
          quoteError.info,
          request.quotes as TransactionPayQuote<unknown>[],
        );
      }
      throw quoteError;
    }
  }
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

  // Safe-based (legacy) Predict withdraws move the source token (pUSD) out of a
  // Polymarket Safe proxy for very old accounts. The Safe holds legacy USDC.e
  // that is converted to pUSD outside the calls the controller can see, so a
  // faithful simulation is not possible without synthesising calldata that is
  // never broadcast. This is a long-tail legacy path, so simulation is skipped.
  // The deposit-wallet variant is unaffected: its exact approve + unwrap batch
  // is known and is still simulated (see buildPolymarketDepositWalletSimulation).
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

/**
 * Build the simulation used to validate a single relay quote.
 *
 * Polymarket deposit-wallet withdraws are a special case: the Relay quote's
 * calldata is a placeholder that is never broadcast (the quote was requested
 * with `useDepositAddress: true`). The transaction actually submitted is a
 * hardcoded approve + unwrap batch executed by the CREATE2 deposit wallet, so
 * validation simulates that batch directly. All other flows simulate the relay
 * submit calls. (Safe-based legacy Predict withdraws never reach here — they are
 * skipped in `shouldSkipValidation`.)
 *
 * @param request - Validation request (messenger, transaction, signal).
 * @param quote - Relay quote to validate.
 * @returns The simulation to pass to `validateQuoteExecution`.
 */
async function buildValidationSimulation(
  request: ValidateRelayQuotesRequest,
  quote: TransactionPayQuote<RelayQuote>,
): Promise<QuoteSimulation> {
  if (quote.request.isPolymarketDepositWallet) {
    return await buildPolymarketDepositWalletSimulation(
      quote,
      quote.request.from,
      request.messenger,
    );
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

function toQuoteError(error: unknown): QuoteError {
  if (isQuoteError(error)) {
    return error;
  }
  return new QuoteError({
    message: 'Quote simulation failed',
    reason: 'simulation-failed',
    detail: [(error as Error).message],
  });
}

function buildRelayValidationSimulation(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<RelayQuote>,
  calls: TransactionParams[],
  executeRequest?: Omit<RelayExecuteRequest, 'metamask'>,
): QuoteSimulation {
  const { from, sourceChainId, targetChainId } = quote.request;
  const context = { from, sourceChainId, targetChainId };

  // The execute and 7702 paths are authorized transactions executed by, and
  // 7702-upgraded for, the user's EOA (`quote.request.from`).
  if (executeRequest) {
    log('Building execute simulation', context);
    return buildRelayExecuteSimulation(quote, executeRequest);
  }
  if (quote.original.metamask.is7702) {
    log('Building 7702 batch simulation', context);
    return buildRelay7702BatchSimulation(messenger, quote, calls);
  }
  log('Building normal simulation', context);
  return buildRelayNormalSimulation(calls);
}

function buildRelayExecuteSimulation(
  quote: TransactionPayQuote<RelayQuote>,
  executeRequest: Omit<RelayExecuteRequest, 'metamask'>,
): QuoteSimulation {
  const { value } = executeRequest.data;
  const valueHex = new BigNumber(value).toString(16).replace(/^/u, '0x') as Hex;

  // The `redeemDelegations` transaction is executed by, and 7702-authorized for,
  // the EOA the delegation was built for (`quote.request.from`). The `from` and
  // `authorizationList[].from` must therefore stay the EOA so the simulation
  // upgrades the correct account and models the real `msg.sender`. This path is
  // never reached for Safe-based Predict withdraws (handled earlier by a direct
  // source simulation), so the EOA is always both sender and source holder.
  const { from } = quote.request;
  return {
    transactions: [
      {
        ...(executeRequest.data.authorizationList?.length
          ? {
              authorizationList: executeRequest.data.authorizationList.map(
                (auth) => ({ address: auth.address, from }),
              ),
            }
          : {}),
        data: executeRequest.data.data,
        from,
        to: executeRequest.data.to,
        value: valueHex,
      },
    ],
  };
}

function buildRelay7702BatchSimulation(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<RelayQuote>,
  calls: TransactionParams[],
): QuoteSimulation {
  const { sourceChainId } = quote.request;
  // The batch call is an ERC-7821 `execute` on the sender's OWN account, which
  // must be 7702-upgraded. That account is the EOA the batch was built for
  // (`quote.request.from`). This path is never reached for Safe-based Predict
  // withdraws (handled earlier by a direct source simulation), so the sender and
  // authorization stay the EOA.
  const { from } = quote.request;
  const gas = quote.original.metamask.gasLimits[0];

  const batchTx = generateEIP7702BatchTransaction(
    from,
    calls.map((params) => ({
      to: params.to as Hex,
      data: params.data as Hex,
      value: params.value as Hex,
    })),
  );

  // The account must appear upgraded for the simulation to succeed. The quote
  // does not always carry an authorization, and there is no fast way to check
  // the live upgrade state, so an authorization is always included: the
  // delegator address comes from the quote when present, otherwise from the
  // configured EIP-7702 upgrade contract for the chain.
  const address =
    quote.original.request.authorizationList?.[0]?.address ??
    getEIP7702UpgradeContractAddress(messenger, sourceChainId);

  const authorizationList = address ? [{ address, from }] : undefined;

  return {
    transactions: [
      {
        ...(authorizationList ? { authorizationList } : {}),
        data: batchTx.data,
        from,
        ...(gas === undefined || gas === 0 ? {} : { gas: toHex(gas) }),
        to: batchTx.to as Hex,
        value: '0x0',
      },
    ],
  };
}

function buildRelayNormalSimulation(
  calls: TransactionParams[],
): QuoteSimulation {
  return {
    transactions: calls.map((params) => {
      const gas = params.gas as Hex | undefined;
      return {
        data: params.data as Hex | undefined,
        from: params.from as Hex,
        ...(gas === undefined || new BigNumber(gas).isZero() ? {} : { gas }),
        maxFeePerGas: params.maxFeePerGas as Hex | undefined,
        maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex | undefined,
        to: params.to as Hex | undefined,
        value: params.value as Hex,
      };
    }),
  };
}
