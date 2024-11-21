import { createModuleLogger } from '@metamask/utils';

import { FirstTimeInteractionError } from '../errors';
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
  chainId?: number;
  count?: number;
  data?: {
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
  txHash?: string;
};

export type AccountAddressRelationshipResult =
  AccountAddressRelationshipResponse & {
    error?: {
      code: string;
      message: string;
    };
  };

export type GetAccountAddressRelationshipRequest = {
  /** Chain ID of account relationship to check. */
  chainId: number;

  /** Recipient of the transaction. */
  to: string;

  /** Sender of the transaction. */
  from: string;
};

const BASE_URL = `https://accounts.api.cx.metamask.io/v1/accounts/`;

const log = createModuleLogger(projectLogger, 'accounts-api');

/**
 * Fetch account address relationship from the accounts API.
 * @param request - The request object.
 * @returns The raw response object from the API.
 */
export async function getAccountAddressRelationship(
  request: GetAccountAddressRelationshipRequest,
): Promise<AccountAddressRelationshipResult> {
  const { chainId, from, to } = request;

  if (!SUPPORTED_CHAIN_IDS_FOR_RELATIONSHIP_API.includes(chainId)) {
    log('Unsupported chain ID for account relationship API', chainId);
    throw new FirstTimeInteractionError('Unsupported chain ID');
  }

  const url = `${BASE_URL}/v1/networks/${chainId}/accounts/${from}/relationships/${to}`;

  log('Getting account address relationship', { request, url });

  const response = await fetch(url);

  if (response.status === 204) {
    // The accounts API returns a 204 status code when there are no transactions with empty body
    // imitating a count of 0
    return { count: 0 };
  }

  const responseJson: AccountAddressRelationshipResult = await response.json();

  log('Retrieved account address relationship', responseJson);

  if (responseJson.error) {
    const { code, message } = responseJson.error;
    throw new FirstTimeInteractionError(message, code);
  }

  return responseJson;
}
