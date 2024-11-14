import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';

const SUPPORTED_CHAIN_IDS_FOR_RELATIONSHIP_API = [
  1, // Ethereum Mainnet
  10, // Optimism
  56, // BSC
  137, // Polygon
  8453, // Base
  42161, // Arbitrum
  59144, // Linea
  534352, // Scroll
];

export type AccountAddressRelationshipResponse = {
  chainId: number;
  count: number;
  data: {
    hash: string;
    timestamp: string;
    chainId: number;
    blockNumber: string;
    blockHash: string;
    gas: number;
    gasUsed: number;
    gasPrice: string;
    effectiveGasPrice: number;
    nonce: number;
    cumulativeGasUsed: number;
    methodId: string;
    value: string;
    to: string;
    from: string;
  };
  txHash: string;
};

export type AccountAddressRelationshipResult =
  AccountAddressRelationshipResponse & {
    error?: string;
  };

export type GetAccountAddressRelationshipRequest = {
  /** Chain ID of account relationship to check. */
  chainId: number;

  /** Recipient of the transaction. */
  to: string;

  /** Sender of the transaction. */
  from: string;
};

export type GetAccountFirstTimeInteractionResponse = {
  isFirstTimeInteraction: boolean | undefined;
  isFirstTimeInteractionDisabled: boolean;
};

const BASE_URL = `https://accounts.api.cx.metamask.io/v1/accounts/`;

const log = createModuleLogger(projectLogger, 'accounts-api');

/**
 * Fetch account address relationship from the accounts API.
 * @param request - The request object.
 * @returns The response object.
 */
export async function getAccountAddressRelationship(
  request: GetAccountAddressRelationshipRequest,
): Promise<GetAccountFirstTimeInteractionResponse> {
  const { chainId, from, to } = request;

  if (!SUPPORTED_CHAIN_IDS_FOR_RELATIONSHIP_API.includes(chainId)) {
    log('Unsupported chain ID for account relationship API', chainId);
    return {
      isFirstTimeInteraction: undefined,
      isFirstTimeInteractionDisabled: true,
    };
  }

  const url = `${BASE_URL}/v1/networks/${chainId}/accounts/${from}/relationships/${to}`;

  log('Getting account address relationship', { request, url });

  const response = await fetch(url);

  // The accounts API returns a 204 if the relationship does not exist
  if (response.status === 204) {
    log(
      'No content for account address relationship, marking as first interaction',
    );
    return {
      isFirstTimeInteraction: true,
      isFirstTimeInteractionDisabled: false,
    };
  }

  const responseJson: AccountAddressRelationshipResult = await response.json();

  log('Retrieved account address relationship', responseJson);

  if (responseJson.error) {
    // The accounts API returns an error we ignore the relationship feature
    log('Error fetching account address relationship', responseJson.error);
    return {
      isFirstTimeInteraction: undefined,
      isFirstTimeInteractionDisabled: true,
    };
  }

  const { count } = responseJson;

  if (count === undefined) {
    // The accounts API returns no count hence we will ignore the relationship feature
    return {
      isFirstTimeInteraction: undefined,
      isFirstTimeInteractionDisabled: true,
    };
  }

  return {
    isFirstTimeInteraction: count === 0,
    isFirstTimeInteractionDisabled: false,
  };
}
