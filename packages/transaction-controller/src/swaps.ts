/* eslint-disable jsdoc/require-returns */
import { query } from '@metamask/controller-utils';

import { CHAIN_IDS } from './constants';
import { createModuleLogger, projectLogger } from './logger';
import type { TransactionMeta } from './types';
import { TransactionType } from './types';

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
  TransactionType.swapApproval,
];

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
    ethQuery: any;
    getTransaction: (transactionId: string) => TransactionMeta | undefined;
    updateTransaction: (transactionMeta: TransactionMeta, note: string) => void;
  },
): Promise<{
  updatedTransactionMeta: TransactionMeta;
  approvalTransactionMeta?: TransactionMeta;
}> {
  console.log('Updating post transaction balance', transactionMeta.id);

  const transactionId = transactionMeta.id;
  let latestTransactionMeta, approvalTransactionMeta;

  for (let i = 0; i < UPDATE_POST_TX_BALANCE_ATTEMPTS; i++) {
    console.log('Querying balance', { attempt: i });

    const postTransactionBalance = await query(ethQuery, 'getBalance', [
      transactionMeta.transaction.from,
    ]);

    latestTransactionMeta = getTransaction(transactionId) as TransactionMeta;

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
