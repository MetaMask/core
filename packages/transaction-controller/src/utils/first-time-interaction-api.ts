import { createModuleLogger, type Hex } from '@metamask/utils';

import { FirstTimeInteractionError } from '../errors';
import { projectLogger } from '../logger';

const BASE_URL = 'https://primitives.api.cx.metamask.io';
const FAILED_TO_PARSE_MESSAGE = 'Failed to parse account address relationship.';

const log = createModuleLogger(projectLogger, 'first-time-interaction-api');

export type FirstTimeInteractionRequest = {
  /** Chain ID of the transaction. */
  chainId: Hex;

  /** Recipient of the transaction. */
  to?: string;

  /** Sender of the transaction. */
  from: string;
};

export type FirstTimeInteractionResponse = {
  isFirstTimeInteraction?: boolean;
};

/**
 * Get the first time interaction count for an account.
 * @param request - The request to get the first time interaction count for.
 * @returns The first time interaction count for the account.
 */
export async function getFirstTimeInteraction(
  request: FirstTimeInteractionRequest,
): Promise<FirstTimeInteractionResponse> {
  const url = await getFirstTimeInteractionUrl(request);

  log('Sending request', url, request);

  const response = await fetch(url, {
    method: 'GET',
  });

  const responseJson = await response.json();

  log('Received response', responseJson);

  if (responseJson.error) {
    const { message, code } = responseJson.error;

    if (message === FAILED_TO_PARSE_MESSAGE) {
      return { isFirstTimeInteraction: true };
    }

    throw new FirstTimeInteractionError(message, code);
  }

  return {
    isFirstTimeInteraction:
      responseJson?.count === 0 || responseJson?.count === undefined,
  };
}

/**
 * Get the URL for the first time interaction API.
 * @param request - The request to get the URL for.
 * @returns The URL for the first time interaction API.
 */
async function getFirstTimeInteractionUrl(
  request: FirstTimeInteractionRequest,
): Promise<string> {
  const { chainId, from, to } = request;

  // The values are not undefined because they are validated in the controller
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `${BASE_URL}/v1/networks/${chainId}/accounts/${from}/relationships/${to}`;
}
