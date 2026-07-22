import type {
  SentinelSimulationRequest,
  SentinelSimulationResponse,
} from '@metamask/sentinel-api-service';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import {
  CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
  DELEGATION_MANAGER_ADDRESSES,
} from '../constants';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { GetSimulationConfig } from '../types';

const log = createModuleLogger(projectLogger, 'simulation-api');

/**
 * Request to simulate transactions, extended with the transaction-controller-only
 * `getSimulationConfig` hook for URL rewriting.
 */
export type SimulationRequest = SentinelSimulationRequest & {
  /**
   * Optional callback to rewrite the simulation request URL.
   * Transaction-controller-only field; not forwarded to the Sentinel API.
   */
  getSimulationConfig?: GetSimulationConfig;
};

/**
 * Simulate transactions via the `SentinelApiService:simulateTransactions`
 * messenger action.
 *
 * The DelegationManager code override is still applied locally via
 * {@link finalizeRequest} before delegating the actual
 * `infura_simulateTransactions` request (URL derivation, JSON-RPC transport,
 * validation, and error handling) to the shared service.
 *
 * @param messenger - The transaction-controller messenger, used to invoke
 * `SentinelApiService:simulateTransactions`.
 * @param chainId - The chain ID to simulate transactions on.
 * @param request - The request to simulate transactions.
 * @returns The response from the simulation API.
 */
export async function simulateTransactions(
  messenger: TransactionControllerMessenger,
  chainId: Hex,
  request: SimulationRequest,
): Promise<SentinelSimulationResponse> {
  const finalizedRequest = finalizeRequest(request);

  const { getSimulationConfig, ...sentinelRequest } = finalizedRequest;

  const getUrl = getSimulationConfig
    ? async (defaultUrl: string): Promise<string> => {
        const { newUrl } = (await getSimulationConfig(defaultUrl)) ?? {};
        return newUrl ?? defaultUrl;
      }
    : undefined;

  log('Sending request', chainId, sentinelRequest);

  const response = await messenger.call(
    'SentinelApiService:simulateTransactions',
    chainId,
    sentinelRequest,
    getUrl ? { getUrl } : {},
  );

  log('Received response', response);

  return response;
}

/**
 * Finalize the simulation request.
 * Overrides the DelegationManager code to remove signature errors.
 * Temporary pending support in the simulation API.
 *
 * @param request - The simulation request to finalize.
 * @returns The finalized simulation request.
 */
function finalizeRequest(request: SimulationRequest): SimulationRequest {
  const newRequest = cloneDeep(request);

  for (const transaction of newRequest.transactions) {
    const normalizedTo = transaction.to?.toLowerCase() as Hex;

    const isToDelegationManager =
      DELEGATION_MANAGER_ADDRESSES.includes(normalizedTo);

    if (!isToDelegationManager) {
      continue;
    }

    newRequest.overrides = newRequest.overrides ?? {};

    newRequest.overrides[normalizedTo] = {
      code: CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
    };
  }

  return newRequest;
}
