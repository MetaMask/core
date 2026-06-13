import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../../constants';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import type { SimulationTransaction } from '../../utils/simulation';
import { QuoteValidationError } from '../../utils/validation';
import type { QuoteValidationSimulation } from '../../utils/validation';
import {
  buildRelayExecuteRequest,
  buildRelaySubmitParams,
} from './relay-submit';
import type { RelayExecuteRequest, RelayQuote } from './types';

const ERC7579_CALL_TYPE_BATCH = '01';
const ERC7579_EXEC_TYPE_DEFAULT = '00';
const CALLS_SIGNATURE = '(address,uint256,bytes)[]';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex;

const erc7821Interface = new Interface([
  'function execute(bytes32 mode, bytes executionData)',
]);

export { QuoteValidationError as RelayQuoteValidationError };

export async function buildRelaySimulation({
  messenger,
  quote,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  transaction: TransactionMeta;
}): Promise<QuoteValidationSimulation> {
  const { allParams } = await buildRelaySubmitParams({
    messenger,
    quote,
    transaction,
  });

  if (quote.original.metamask.isExecute) {
    return await buildRelayExecuteSimulation({
      allParams,
      messenger,
      quote,
      transaction,
    });
  }

  if (quote.original.metamask.is7702) {
    return buildRelay7702BatchSimulation(quote, allParams);
  }

  return {
    transactions: allParams.map(toSimulationTransaction),
  };
}

async function buildRelayExecuteSimulation({
  allParams,
  messenger,
  quote,
  transaction,
}: {
  allParams: TransactionParams[];
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  transaction: TransactionMeta;
}): Promise<QuoteValidationSimulation> {
  const executeRequest = await buildRelayExecuteRequest({
    allParams,
    messenger,
    quote,
    transaction,
  });
  validateAuthorizationList(executeRequest, quote);

  const transactionToSimulate = {
    data: executeRequest.data.data,
    from: quote.request.from,
    to: executeRequest.data.to,
    value: decimalToHex(executeRequest.data.value),
  };

  return {
    ...(executeRequest.data.authorizationList?.length
      ? { mock7702From: quote.request.from }
      : {}),
    transactions: [transactionToSimulate],
  };
}

function buildRelay7702BatchSimulation(
  quote: TransactionPayQuote<RelayQuote>,
  allParams: TransactionParams[],
): QuoteValidationSimulation {
  const { from } = quote.request;
  const batchTransaction = buildEip7702BatchTransaction(from, allParams, quote);

  return {
    ...(quote.original.request.authorizationList?.length
      ? { mock7702From: from }
      : {}),
    transactions: [batchTransaction],
  };
}

function buildEip7702BatchTransaction(
  from: Hex,
  allParams: TransactionParams[],
  quote: TransactionPayQuote<RelayQuote>,
): SimulationTransaction {
  const calls = allParams.map((params) => [
    (params.to as Hex | undefined) ?? ZERO_ADDRESS,
    params.value ?? '0x0',
    params.data ?? '0x',
  ]);
  const mode =
    `0x${ERC7579_CALL_TYPE_BATCH}${ERC7579_EXEC_TYPE_DEFAULT}`.padEnd(
      66,
      '0',
    ) as Hex;
  const executionData = defaultAbiCoder.encode(
    [CALLS_SIGNATURE],
    [calls],
  ) as Hex;
  const gas = quote.original.metamask.gasLimits[0];

  return {
    data: erc7821Interface.encodeFunctionData('execute', [
      mode,
      executionData,
    ]) as Hex,
    from,
    ...(gas === undefined ? {} : { gas: toHex(gas) }),
    to: from,
    value: '0x0',
  };
}

function validateAuthorizationList(
  executeRequest: RelayExecuteRequest,
  quote: TransactionPayQuote<RelayQuote>,
): void {
  for (const authorization of executeRequest.data.authorizationList ?? []) {
    if (
      authorization.address === undefined ||
      authorization.chainId === undefined ||
      authorization.nonce === undefined ||
      authorization.r === undefined ||
      authorization.s === undefined ||
      authorization.yParity === undefined
    ) {
      throw new QuoteValidationError({
        chainId: quote.request.sourceChainId,
        code: 'quote_authorization_invalid',
        message: 'Relay execute authorization list is incomplete',
        strategy: TransactionPayStrategy.Relay,
        tokenAddress: quote.request.sourceTokenAddress,
      });
    }
  }
}

function toSimulationTransaction(
  params: TransactionParams,
): SimulationTransaction {
  return {
    data: params.data as Hex | undefined,
    from: params.from as Hex,
    gas: params.gas as Hex | undefined,
    maxFeePerGas: params.maxFeePerGas as Hex | undefined,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex | undefined,
    to: params.to as Hex | undefined,
    value: (params.value as Hex | undefined) ?? '0x0',
  };
}

function decimalToHex(value: string): Hex {
  return new BigNumber(value).toString(16).replace(/^/u, '0x') as Hex;
}
