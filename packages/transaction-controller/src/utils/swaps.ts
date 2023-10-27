import { merge, pickBy } from 'lodash';

import { CHAIN_IDS } from '../constants';
import { type TransactionMeta, TransactionType } from '../types';
import { validateIfTransactionUnapproved } from './utils';

const SWAPS_TESTNET_CHAIN_ID = '0x539';

// An address that the metaswap-api recognizes as the default token for the current network,
// in place of the token address that ERC-20 tokens have
export const DEFAULT_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000';

export interface SwapsTokenObject {
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

export const ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
};

export const BNB_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Binance Coin',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const MATIC_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Matic',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const AVAX_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Avalanche',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const TEST_ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Test Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const GOERLI_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const ARBITRUM_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const OPTIMISM_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const ZKSYNC_ERA_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
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

// Only certain types of transactions should be allowed to be specified when
// adding a new unapproved transaction.
export const VALID_UNAPPROVED_TRANSACTION_TYPES = [
  ...SWAP_TRANSACTION_TYPES,
  TransactionType.simpleSend,
  TransactionType.tokenMethodTransfer,
  TransactionType.tokenMethodTransferFrom,
  TransactionType.contractInteraction,
];

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
 */
export function updateSwapTransaction(
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
) {
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
  swapTransaction = pickBy(swapTransaction) as any;
  merge(transactionMeta, swapTransaction);
}

/**
 * Updates the transaction meta object with the swap approval information
 *
 * @param transactionMeta - Transaction meta object to update
 * @param propsToUpdate - Properties to update
 * @param propsToUpdate.type - Type of the transaction
 * @param propsToUpdate.sourceTokenSymbol - Symbol of the token to be swapped
 */
export function updateSwapApprovalTransaction(
  transactionMeta: TransactionMeta,
  { type, sourceTokenSymbol }: Partial<TransactionMeta>,
) {
  validateIfTransactionUnapproved(
    transactionMeta,
    'updateSwapApprovalTransaction',
  );

  let swapApprovalTransaction = { type, sourceTokenSymbol } as any;
  swapApprovalTransaction = pickBy({
    type,
    sourceTokenSymbol,
  }) as Partial<TransactionMeta>;
  merge(transactionMeta, swapApprovalTransaction);
}

/**
 * Checks whether the provided address is strictly equal to the address for
 * the default swaps token of the provided chain.
 *
 * @param address - The string to compare to the default token address
 * @param chainId - The hex encoded chain ID of the default swaps token to check
 * @returns Whether the address is the provided chain's default token address
 */
export function isSwapsDefaultTokenAddress(address: string, chainId: string) {
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
