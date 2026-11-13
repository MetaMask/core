import { SentinelChainNotSupportedError } from '@metamask/sentinel-api-service';
import type {
  SentinelSimulationRequest,
  SentinelSimulationResponse,
} from '@metamask/sentinel-api-service';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash-es';

import {
  CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
  DELEGATION_MANAGER_ADDRESSES,
} from '../constants.js';
import { SimulationChainNotSupportedError } from '../errors.js';
import { projectLogger } from '../logger.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import type { GetSimulationConfig } from '../types.js';

const log = createModuleLogger(projectLogger, 'simulation-api');

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
 * @param options - Additional options.
 * @param options.getSimulationConfig - Optional callback to rewrite the
 * simulation request URL.
 * @returns The response from the simulation API.
 */
export async function simulateTransactions(
  messenger: TransactionControllerMessenger,
  chainId: Hex,
  request: SentinelSimulationRequest,
  {
    getSimulationConfig,
  }: {
    getSimulationConfig?: GetSimulationConfig;
  } = {},
): Promise<SentinelSimulationResponse> {
  const finalizedRequest = finalizeRequest(request);

  const getUrl = getSimulationConfig
    ? async (defaultUrl: string): Promise<string> => {
        const { newUrl } = (await getSimulationConfig(defaultUrl)) ?? {};
        return newUrl ?? defaultUrl;
      }
    : undefined;

  log('Sending request', chainId, finalizedRequest);

  let response: SentinelSimulationResponse;

  try {
    response = await messenger.call(
      'SentinelApiService:simulateTransactions',
      chainId,
      finalizedRequest,
      getUrl ? { getUrl } : {},
    );
  } catch (error) {
    // Preserve the `ChainNotSupported` simulation error code relied on by clients.
    if (error instanceof SentinelChainNotSupportedError) {
      throw new SimulationChainNotSupportedError(chainId);
    }

    throw error;
  }

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
function finalizeRequest(
  request: SentinelSimulationRequest,
): SentinelSimulationRequest {
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
