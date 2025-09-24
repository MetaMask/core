import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
  SimulationTokenStandard,
} from '@metamask/transaction-controller';

/**
 * Formats a hostname into a URL so we can parse it correctly
 * and pass full URLs into the PhishingDetector class. Previously
 * only hostnames were supported, but now only full URLs are
 * supported since we want to block IPFS CIDs.
 *
 * @param hostname - the hostname of the URL.
 * @returns the href property of a URL object.
 */
export const formatHostnameToUrl = (hostname: string): string => {
  let url = '';
  try {
    url = new URL(hostname).href;
  } catch (e) {
    url = new URL(['https://', hostname].join('')).href;
  }
  return url;
};

/**
 * Test addresses for consistent use in tests
 */
export const TEST_ADDRESSES = {
  MOCK_TOKEN_1: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  USDC: '0xA0B86991c6218B36C1D19D4A2E9EB0CE3606EB48' as `0x${string}`,
  FROM_ADDRESS: '0x0987654321098765432109876543210987654321' as `0x${string}`,
  TO_ADDRESS: '0x1234567890123456789012345678901234567890' as `0x${string}`,
};

/**
 * Creates a mock token balance change object
 *
 * @param address - The address of the token
 * @param options - The options for the token balance change
 * @param options.difference - The difference in the token balance
 * @param options.previousBalance - The previous balance of the token
 * @param options.newBalance - The new balance of the token
 * @param options.isDecrease - Whether the token balance is decreasing
 * @param options.standard - The standard of the token
 * @returns The mock token balance change object
 */
export const createMockTokenBalanceChange = (
  address: `0x${string}`,
  options: {
    difference?: `0x${string}`;
    previousBalance?: `0x${string}`;
    newBalance?: `0x${string}`;
    isDecrease?: boolean;
    standard?: SimulationTokenStandard;
  } = {},
) => ({
  address,
  standard: options.standard ?? SimulationTokenStandard.erc20,
  difference: options.difference ?? ('0xde0b6b3a7640000' as `0x${string}`),
  previousBalance: options.previousBalance ?? ('0x0' as `0x${string}`),
  newBalance: options.newBalance ?? ('0xde0b6b3a7640000' as `0x${string}`),
  isDecrease: options.isDecrease ?? false,
});

/**
 * Creates a mock transaction with token balance changes
 *
 * @param id - The transaction ID
 * @param tokenAddresses - Array of token addresses to include in balance changes
 * @param overrides - Partial transaction metadata to override defaults
 * @returns The mock transaction metadata object
 */
export const createMockTransaction = (
  id: string,
  tokenAddresses: `0x${string}`[] = [],
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta => {
  const simulationData =
    tokenAddresses.length > 0
      ? {
          tokenBalanceChanges: tokenAddresses.map((address) =>
            createMockTokenBalanceChange(address),
          ),
        }
      : overrides.simulationData;

  return {
    txParams: {
      from: TEST_ADDRESSES.FROM_ADDRESS,
      to: TEST_ADDRESSES.TO_ADDRESS,
      value: '0x0' as `0x${string}`,
    },
    chainId: '0x1' as `0x${string}`,
    id,
    networkClientId: 'mainnet',
    status: TransactionStatus.unapproved,
    time: Date.now(),
    type: TransactionType.contractInteraction,
    origin: 'https://metamask.io',
    submittedTime: Date.now(),
    simulationData,
    ...overrides,
  };
};

/**
 * Creates a mock state change payload for TransactionController
 *
 * @param transactions - The transactions to include in the state change payload.
 * @returns A mock state change payload.
 */
export const createMockStateChangePayload = (
  transactions: TransactionMeta[],
) => ({
  transactions,
  transactionBatches: [],
  methodData: {},
  lastFetchedBlockNumbers: {},
  submitHistory: [],
});
