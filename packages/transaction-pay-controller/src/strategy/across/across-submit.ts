import { ORIGIN_METAMASK, toHex } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  BatchTransactionParams,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { AcrossQuote, AcrossSwapApprovalResponse } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getGasBuffer } from '../../utils/feature-flags';
import {
  SourceTransaction,
  submitSourceTransactions,
} from '../../utils/strategy-helpers';

const log = createModuleLogger(projectLogger, 'across-strategy');

/**
 * Submit Across quotes.
 *
 * @param request - Request object.
 * @returns An object containing the transaction hash if available.
 */
export async function submitAcrossQuotes(
  request: PayStrategyExecuteRequest<AcrossQuote>,
): Promise<{ transactionHash?: Hex }> {
  log('Executing quotes', request);

  const acrossDepositType = getAcrossDepositType(request.transaction.type);
  const { messenger } = request;

  return submitSourceTransactions({
    request,
    requiredTransactionNote:
      'Add required transaction ID from Across submission',
    intentCompleteNote: 'Intent complete after Across submission',
    buildTransactions: async (quote) => {
      log('Executing single quote', quote);

      const { swapTx, approvalTxns } = quote.original.quote;
      const { from } = quote.request;
      const chainId = toHex(swapTx.chainId);

      const networkClientId = messenger.call(
        'NetworkController:findNetworkClientIdByChainId',
        chainId,
      );

      const transactions: SourceTransaction[] = [];

      if (approvalTxns?.length) {
        for (const approval of approvalTxns) {
          transactions.push({
            params: await buildTransactionParams(messenger, from, {
              chainId: approval.chainId,
              data: approval.data,
              to: approval.to,
              value: approval.value,
            }),
            type: TransactionType.tokenMethodApprove,
          });
        }
      }

      transactions.push({
        params: await buildTransactionParams(messenger, from, {
          chainId: swapTx.chainId,
          data: swapTx.data,
          to: swapTx.to,
          value: swapTx.value,
          maxFeePerGas: swapTx.maxFeePerGas,
          maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
        }),
        type: acrossDepositType,
      });

      return {
        chainId,
        from,
        transactions,
        submit: async (preparedTransactions): Promise<void> => {
          if (preparedTransactions.length === 1) {
            const result = await messenger.call(
              'TransactionController:addTransaction',
              preparedTransactions[0].params,
              {
                networkClientId,
                origin: ORIGIN_METAMASK,
                requireApproval: false,
                type: preparedTransactions[0].type,
              },
            );

            const txHash = await result.result;
            log('Submitted transaction', txHash);
            return;
          }

          const batchTransactions = preparedTransactions.map(
            ({ params, type }) => ({
              params: toBatchTransactionParams(params),
              type,
            }),
          );

          await messenger.call('TransactionController:addTransactionBatch', {
            from,
            networkClientId,
            origin: ORIGIN_METAMASK,
            requireApproval: false,
            transactions: batchTransactions,
          });
        },
      };
    },
  });
}

function getAcrossDepositType(
  transactionType?: TransactionType,
): TransactionType {
  switch (transactionType) {
    case TransactionType.perpsDeposit:
      return TransactionType.perpsAcrossDeposit;
    case TransactionType.predictDeposit:
      return TransactionType.predictAcrossDeposit;
    default:
      return TransactionType.perpsAcrossDeposit;
  }
}

async function buildTransactionParams(
  messenger: TransactionPayControllerMessenger,
  from: Hex,
  params: {
    chainId: number;
    data: Hex;
    to: Hex;
    value?: Hex;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  },
): Promise<TransactionParams> {
  const chainId = toHex(params.chainId);
  const value = toHex(params.value ?? '0x0');

  const gas = await estimateGasWithBuffer(
    messenger,
    {
      chainId,
      data: params.data,
      to: params.to,
      value,
    },
    from,
  );

  return {
    data: params.data,
    from,
    gas: toHex(gas),
    maxFeePerGas: params.maxFeePerGas as Hex | undefined,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex | undefined,
    to: params.to,
    value,
  };
}

function toBatchTransactionParams(
  params: TransactionParams,
): BatchTransactionParams {
  return {
    data: params.data as Hex | undefined,
    gas: params.gas as Hex | undefined,
    maxFeePerGas: params.maxFeePerGas as Hex | undefined,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex | undefined,
    to: params.to as Hex | undefined,
    value: params.value as Hex | undefined,
  };
}

async function estimateGasWithBuffer(
  messenger: TransactionPayControllerMessenger,
  params: {
    chainId: Hex;
    data: Hex;
    to: Hex;
    value: Hex;
  },
  from: Hex,
): Promise<number> {
  const { chainId, data, to, value } = params;

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );

  try {
    const { gas: gasHex } = await messenger.call(
      'TransactionController:estimateGas',
      { from, data, to, value },
      networkClientId,
    );

    const gasBuffer = getGasBuffer(messenger, chainId);
    const estimatedGas = new BigNumber(gasHex).toNumber();

    return Math.ceil(estimatedGas * gasBuffer);
  } catch (error) {
    log('Gas estimate failed, using fallback', { error });
    return 900000;
  }
}

export function isAcrossQuote(
  quote: TransactionPayQuote<AcrossQuote>,
): quote is TransactionPayQuote<AcrossQuote> {
  return Boolean(quote.original?.quote);
}

export function getAcrossOriginalQuote(
  quote: TransactionPayQuote<AcrossQuote>,
): AcrossSwapApprovalResponse {
  return quote.original.quote;
}
