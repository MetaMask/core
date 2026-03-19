/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { isNonEvmChainId } from '@metamask/bridge-controller';

import { submitBatchHandler } from './batch-strategy';
import { submitEvmHandler as defaultSubmitHandler } from './evm-strategy';
import { submitIntentHandler } from './intent-strategy';
import { submitNonEvmHandler } from './non-evm-strategy';
import type {
  SubmitStrategyParams,
  SubmitStepResult,
  SubmitStrategy,
} from './types';

const SUBMIT_STRATEGY_REGISTRY: SubmitStrategy[] = [
  {
    matchesFlow: (params: SubmitStrategyParams) => {
      const { quoteResponse } = params;
      return isNonEvmChainId(quoteResponse.quote.srcChainId);
    },
    execute: submitNonEvmHandler,
  },
  {
    matchesFlow: (params: SubmitStrategyParams) => {
      const { quoteResponse, isStxEnabledOnClient, isDelegatedAccount } =
        params;
      return (
        isStxEnabledOnClient ||
        quoteResponse.quote.gasIncluded7702 ||
        isDelegatedAccount
      );
    },
    execute: submitBatchHandler,
  },
  {
    matchesFlow: (params: SubmitStrategyParams) => {
      const { quoteResponse } = params;
      return Boolean(quoteResponse.quote.intent);
    },
    execute: submitIntentHandler,
  },
];

/**
 * Selects the appropriate submit strategy based on the quote parameters and executes it
 *
 * @param params - The parameters for the transaction
 * @returns An async generator that yields results from each step of the submit flow. The yielded
 * results are used to update the BridgeStatusController state and emit events.
 */
const executeSubmitFlow = (
  params: SubmitStrategyParams,
): AsyncGenerator<SubmitStepResult, void, void> => {
  return (
    SUBMIT_STRATEGY_REGISTRY.find((strategy) => strategy.matchesFlow(params))
      ?.execute ?? defaultSubmitHandler
  )(params);
};

export default executeSubmitFlow;
