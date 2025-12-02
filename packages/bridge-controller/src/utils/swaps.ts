import type { Hex } from '@metamask/utils';

import { formatChainIdToDec } from './caip-formatters';
import { CHAIN_IDS } from '../constants/chains';
import {
  ALLOWED_CONTRACT_ADDRESSES,
  SWAPS_CONTRACT_ADDRESSES,
} from '../constants/swaps';
import {
  DEFAULT_TOKEN_ADDRESS,
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
} from '../constants/tokens';
import type { FetchFunction } from '../types';

/**
 * Checks if the given contract address is valid for the given chain ID.
 *
 * @param chainId - The chain ID.
 * @param contract - The contract address.
 * @returns True if the contract address is valid, false otherwise.
 */
export function isValidSwapsContractAddress(
  chainId: Hex,
  contract: Hex | undefined,
): boolean {
  if (!contract || !ALLOWED_CONTRACT_ADDRESSES[chainId]) {
    return false;
  }
  return ALLOWED_CONTRACT_ADDRESSES[chainId].some(
    (allowedContract) =>
      contract.toLowerCase() === allowedContract.toLowerCase(),
  );
}

/**
 * Gets the swaps contract address for the given chain ID.
 *
 * @param chainId - The chain ID.
 * @returns The swaps contract address.
 */
export function getSwapsContractAddress(chainId: Hex): string {
  return SWAPS_CONTRACT_ADDRESSES[chainId];
}

/**
 * Gets the client ID header.
 *
 * @param clientId - The client ID.
 * @returns The client ID header.
 */
function getClientIdHeader(clientId?: string) {
  if (!clientId) {
    return undefined;
  }
  return {
    'X-Client-Id': clientId,
  };
}

export const API_BASE_URL = 'https://swap.api.cx.metamask.io';
export const DEV_BASE_URL = 'https://swap.dev-api.cx.metamask.io';

export type SwapsToken = {
  address: string;
  symbol: string;
  name?: string;
  decimals: number;
  iconUrl?: string;
  occurrences?: number;
};

/**
 * Fetches token metadata from API URL.
 *
 * @param chainId - Current chainId.
 * @param fetchFn - Fetch function.
 * @param clientId - Client id.
 * @returns Promise resolving to an object containing token metadata.
 */
export async function fetchTokens(
  chainId: Hex,
  fetchFn: FetchFunction,
  clientId?: string,
): Promise<SwapsToken[]> {
  const [apiChainId, apiBaseUrl] =
    chainId === CHAIN_IDS.LOCALHOST
      ? [CHAIN_IDS.MAINNET, DEV_BASE_URL]
      : [chainId, API_BASE_URL];

  const apiDecimalChainId = formatChainIdToDec(apiChainId);
  const tokenUrl = `${apiBaseUrl}/networks/${apiDecimalChainId}/tokens`;

  const tokens: SwapsToken[] = await fetchFn(tokenUrl, {
    headers: getClientIdHeader(clientId),
  });

  const filteredTokens = tokens.filter((token) => {
    return token.address !== DEFAULT_TOKEN_ADDRESS;
  });

  const nativeSwapsToken =
    SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
      chainId as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
    ];

  filteredTokens.push(nativeSwapsToken);
  return filteredTokens;
}
