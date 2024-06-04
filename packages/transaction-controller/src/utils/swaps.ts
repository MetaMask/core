import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { merge, pickBy } from 'lodash';

import { CHAIN_IDS } from '../constants';
import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import { TransactionType } from '../types';
import { validateIfTransactionUnapproved } from './utils';

const log = createModuleLogger(projectLogger, 'swaps');

/**
 * Interval in milliseconds between checks of post transaction balance
 */
export const UPDATE_POST_TX_BALANCE_TIMEOUT = 5000;

/**
 * Retry attempts for checking post transaction balance
 */
export const UPDATE_POST_TX_BALANCE_ATTEMPTS = 6;

const SWAPS_TESTNET_CHAIN_ID = '0x539';

/**
 * An address that the metaswap-api recognizes as the default token for the current network, in place of the token address that ERC-20 tokens have
 */
export const DEFAULT_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000';

// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface SwapsTokenObject {
  /**
   * The name for the network
   */
  name: string;
  /**
   * An address that the metaswap-api recognizes as the default token
   */
  address: string;
  /**
   * Number of digits after decimal point
   */
  decimals: number;
}

const ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
};

const BNB_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Binance Coin',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

const MATIC_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Matic',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

const AVAX_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Avalanche',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

const TEST_ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Test Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

const GOERLI_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

const ARBITRUM_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

const OPTIMISM_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

const ZKSYNC_ERA_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const SWAPS_CHAINID_DEFAULT_TOKEN_MAP = {
  [CHAIN_IDS.MAINNET]: ETH_SWAPS_TOKEN_OBJECT,
  [SWAPS_TESTNET_CHAIN_ID]: TEST_ETH_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.BSC]: BNB_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.POLYGON]: MATIC_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.GOERLI]: GOERLI_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.AVALANCHE]: AVAX_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.OPTIMISM]: OPTIMISM_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.ARBITRUM]: ARBITRUM_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.ZKSYNC_ERA]: ZKSYNC_ERA_SWAPS_TOKEN_OBJECT,
} as const;

export const SWAP_TRANSACTION_TYPES = [
  TransactionType.swap,
  TransactionType.swapAndSend,
  TransactionType.swapApproval,
];

/**
 * Updates the transaction meta object with the swap information
 *
 * @param transactionMeta - The transaction meta object to update
 * @param transactionType - The type of the transaction
 * @param swaps - The swaps object
 * @param swaps.hasApproveTx - Whether the swap has an approval transaction
 * @param swaps.meta - The swap meta object
 * @param updateSwapsTransactionRequest - Dependency bag
 * @param updateSwapsTransactionRequest.isSwapsDisabled - Whether swaps are disabled
 * @param updateSwapsTransactionRequest.cancelTransaction - Function to cancel a transaction
 * @param updateSwapsTransactionRequest.messenger - TransactionController messenger
 * @returns A copy of the transaction meta object with updates, or the same
 * transaction meta object if no updates were made.
 */
export function updateSwapsTransaction(
  transactionMeta: TransactionMeta,
  transactionType: TransactionType,
  swaps: {
    hasApproveTx?: boolean;
    meta?: Partial<TransactionMeta>;
  },
  {
    isSwapsDisabled,
    cancelTransaction,
    messenger,
  }: {
    isSwapsDisabled: boolean;
    cancelTransaction: (transactionId: string) => void;
    messenger: TransactionControllerMessenger;
  },
): TransactionMeta {
  if (isSwapsDisabled || !SWAP_TRANSACTION_TYPES.includes(transactionType)) {
    return transactionMeta;
  }

  // The simulationFails property is added if the estimateGas call fails. In cases
  // when no swaps approval tx is required, this indicates that the swap will likely
  // fail. There was an earlier estimateGas call made by the swaps controller,
  // but it is possible that external conditions have change since then, and
  // a previously succeeding estimate gas call could now fail. By checking for
  // the `simulationFails` property here, we can reduce the number of swap
  // transactions that get published to the blockchain only to fail and thereby
  // waste the user's funds on gas.
  if (
    transactionType === TransactionType.swap &&
    swaps?.hasApproveTx === false &&
    transactionMeta.simulationFails
  ) {
    cancelTransaction(transactionMeta.id);
    throw new Error('Simulation failed');
  }

  const swapsMeta = swaps?.meta as Partial<TransactionMeta>;

  if (!swapsMeta) {
    return transactionMeta;
  }

  let updatedTransactionMeta = transactionMeta;

  if (transactionType === TransactionType.swapApproval) {
    updatedTransactionMeta = updateSwapApprovalTransaction(
      transactionMeta,
      swapsMeta,
    );
    messenger.publish('TransactionController:transactionNewSwapApproval', {
      transactionMeta: updatedTransactionMeta,
    });
  }

  if (transactionType === TransactionType.swapAndSend) {
    updatedTransactionMeta = updateSwapAndSendTransaction(
      transactionMeta,
      swapsMeta,
    );
    messenger.publish('TransactionController:transactionNewSwapAndSend', {
      transactionMeta: updatedTransactionMeta,
    });
  }

  if (transactionType === TransactionType.swap) {
    updatedTransactionMeta = updateSwapTransaction(transactionMeta, swapsMeta);
    messenger.publish('TransactionController:transactionNewSwap', {
      transactionMeta: updatedTransactionMeta,
    });
  }

  return updatedTransactionMeta;
}

/**
 * Attempts to update the post transaction balance of the provided transaction
 *
 * @param transactionMeta - Transaction meta object to update
 * @param updatePostTransactionBalanceRequest - Dependency bag
 * @param updatePostTransactionBalanceRequest.ethQuery - EthQuery object
 * @param updatePostTransactionBalanceRequest.getTransaction - Reading function for the latest transaction state
 * @param updatePostTransactionBalanceRequest.updateTransaction - Updating transaction function
 */
export async function updatePostTransactionBalance(
  transactionMeta: TransactionMeta,
  {
    ethQuery,
    getTransaction,
    updateTransaction,
  }: {
    ethQuery: EthQuery;
    getTransaction: (transactionId: string) => TransactionMeta | undefined;
    updateTransaction: (transactionMeta: TransactionMeta, note: string) => void;
  },
): Promise<{
  updatedTransactionMeta: TransactionMeta;
  approvalTransactionMeta?: TransactionMeta;
}> {
  log('Updating post transaction balance', transactionMeta.id);

  const transactionId = transactionMeta.id;
  let latestTransactionMeta: TransactionMeta | undefined;
  let approvalTransactionMeta;

  for (let i = 0; i < UPDATE_POST_TX_BALANCE_ATTEMPTS; i++) {
    log('Querying balance', { attempt: i });

    const postTransactionBalance = await query(ethQuery, 'getBalance', [
      transactionMeta.txParams.from,
    ]);

    latestTransactionMeta = {
      ...(getTransaction(transactionId) ?? ({} as TransactionMeta)),
    };

    approvalTransactionMeta = latestTransactionMeta.approvalTxId
      ? getTransaction(latestTransactionMeta.approvalTxId)
      : undefined;

    latestTransactionMeta.postTxBalance = postTransactionBalance.toString(16);

    const isDefaultTokenAddress = isSwapsDefaultTokenAddress(
      transactionMeta.destinationTokenAddress as string,
      transactionMeta.chainId,
    );

    if (
      !isDefaultTokenAddress ||
      transactionMeta.preTxBalance !== latestTransactionMeta.postTxBalance
    ) {
      log('Finishing post balance update', {
        isDefaultTokenAddress,
        preTxBalance: transactionMeta.preTxBalance,
        postTxBalance: latestTransactionMeta.postTxBalance,
      });

      break;
    }

    log('Waiting for balance to update', {
      delay: UPDATE_POST_TX_BALANCE_TIMEOUT,
    });

    await sleep(UPDATE_POST_TX_BALANCE_TIMEOUT);
  }

  updateTransaction(
    latestTransactionMeta as TransactionMeta,
    'TransactionController#updatePostTransactionBalance - Add post transaction balance',
  );

  log('Completed post balance update', latestTransactionMeta?.postTxBalance);

  return {
    updatedTransactionMeta: latestTransactionMeta as TransactionMeta,
    approvalTransactionMeta,
  };
}

/**
 * Updates the transaction meta object with the swap information
 *
 * @param transactionMeta - Transaction meta object to update
 * @param propsToUpdate - Properties to update
 * @param propsToUpdate.sourceTokenSymbol - Symbol of the token to be swapped
 * @param propsToUpdate.destinationTokenSymbol - Symbol of the token to be received
 * @param propsToUpdate.type - Type of the transaction
 * @param propsToUpdate.destinationTokenDecimals - Decimals of the token to be received
 * @param propsToUpdate.destinationTokenAddress - Address of the token to be received
 * @param propsToUpdate.swapMetaData - Metadata of the swap
 * @param propsToUpdate.swapTokenValue - Value of the token to be swapped
 * @param propsToUpdate.estimatedBaseFee - Estimated base fee of the transaction
 * @param propsToUpdate.approvalTxId - Transaction id of the approval transaction
 * @returns The updated transaction meta object.
 */
function updateSwapTransaction(
  transactionMeta: TransactionMeta,
  {
    sourceTokenSymbol,
    destinationTokenSymbol,
    type,
    destinationTokenDecimals,
    destinationTokenAddress,
    swapMetaData,
    swapTokenValue,
    estimatedBaseFee,
    approvalTxId,
  }: Partial<TransactionMeta>,
): TransactionMeta {
  validateIfTransactionUnapproved(transactionMeta, 'updateSwapTransaction');

  let swapTransaction = {
    sourceTokenSymbol,
    destinationTokenSymbol,
    type,
    destinationTokenDecimals,
    destinationTokenAddress,
    swapMetaData,
    swapTokenValue,
    estimatedBaseFee,
    approvalTxId,
  };
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  swapTransaction = pickBy(swapTransaction) as any;

  return merge({}, transactionMeta, swapTransaction);
}

/**
 * Updates the transaction meta object with the swap information
 *
 * @param transactionMeta - Transaction meta object to update
 * @param propsToUpdate - Properties to update
 * @param propsToUpdate.approvalTxId - Transaction id of the approval transaction
 * @param propsToUpdate.destinationTokenAddress - Address of the token to be received
 * @param propsToUpdate.destinationTokenAmount - The raw amount of the destination token
 * @param propsToUpdate.destinationTokenDecimals - Decimals of the token to be received
 * @param propsToUpdate.destinationTokenSymbol - Symbol of the token to be received
 * @param propsToUpdate.estimatedBaseFee - Estimated base fee of the transaction
 * @param propsToUpdate.sourceTokenAddress - The address of the source token
 * @param propsToUpdate.sourceTokenAmount - The raw amount of the source token
 * @param propsToUpdate.sourceTokenDecimals - The decimals of the source token
 * @param propsToUpdate.sourceTokenSymbol - Symbol of the token to be swapped
 * @param propsToUpdate.swapAndSendRecipient - The recipient of the swap and send transaction
 * @param propsToUpdate.swapMetaData - Metadata of the swap
 * @param propsToUpdate.swapTokenValue - Value of the token to be swapped – possibly the same as sourceTokenAmount; included for consistency
 * @param propsToUpdate.type - Type of the transaction
 * @returns The updated transaction meta object.
 */
function updateSwapAndSendTransaction(
  transactionMeta: TransactionMeta,
  {
    approvalTxId,
    destinationTokenAddress,
    destinationTokenAmount,
    destinationTokenDecimals,
    destinationTokenSymbol,
    estimatedBaseFee,
    sourceTokenAddress,
    sourceTokenAmount,
    sourceTokenDecimals,
    sourceTokenSymbol,
    swapAndSendRecipient,
    swapMetaData,
    swapTokenValue,
    type,
  }: Partial<TransactionMeta>,
): TransactionMeta {
  validateIfTransactionUnapproved(transactionMeta, 'updateSwapTransaction');

  let swapTransaction = {
    approvalTxId,
    destinationTokenAddress,
    destinationTokenAmount,
    destinationTokenDecimals,
    destinationTokenSymbol,
    estimatedBaseFee,
    sourceTokenAddress,
    sourceTokenAmount,
    sourceTokenDecimals,
    sourceTokenSymbol,
    swapAndSendRecipient,
    swapMetaData,
    swapTokenValue,
    type,
  };
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  swapTransaction = pickBy(swapTransaction) as any;

  return merge({}, transactionMeta, swapTransaction);
}

/**
 * Updates the transaction meta object with the swap approval information
 *
 * @param transactionMeta - Transaction meta object to update
 * @param propsToUpdate - Properties to update
 * @param propsToUpdate.type - Type of the transaction
 * @param propsToUpdate.sourceTokenSymbol - Symbol of the token to be swapped
 * @returns The updated transaction meta object.
 */
function updateSwapApprovalTransaction(
  transactionMeta: TransactionMeta,
  { type, sourceTokenSymbol }: Partial<TransactionMeta>,
): TransactionMeta {
  validateIfTransactionUnapproved(
    transactionMeta,
    'updateSwapApprovalTransaction',
  );

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let swapApprovalTransaction = { type, sourceTokenSymbol } as any;
  swapApprovalTransaction = pickBy({
    type,
    sourceTokenSymbol,
  }) as Partial<TransactionMeta>;

  return merge({}, transactionMeta, swapApprovalTransaction);
}

/**
 * Checks whether the provided address is strictly equal to the address for
 * the default swaps token of the provided chain.
 *
 * @param address - The string to compare to the default token address
 * @param chainId - The hex encoded chain ID of the default swaps token to check
 * @returns Whether the address is the provided chain's default token address
 */
function isSwapsDefaultTokenAddress(address: string, chainId: string) {
  if (!address || !chainId) {
    return false;
  }

  return (
    address ===
    SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
      chainId as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
    ]?.address
  );
}

/**
 * Sleeps for the provided number of milliseconds
 *
 * @param ms - Number of milliseconds to sleep
 * @returns Promise that resolves after the provided number of milliseconds
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
