import { SolScope } from '@metamask/keyring-api';
import type { CaipChainId } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import { DEFAULT_BRIDGE_CONTROLLER_STATE } from '../constants/bridge';
import type { BridgeControllerMessenger } from '../types';

export const getMinimumBalanceForRentExemptionRequest = (snapId: string) => {
  return {
    snapId: snapId as never,
    origin: 'metamask',
    handler: 'onProtocolRequest' as never,
    request: {
      method: ' ',
      jsonrpc: '2.0',
      params: {
        scope: SolScope.Mainnet,
        request: {
          id: uuid(),
          jsonrpc: '2.0',
          method: 'getMinimumBalanceForRentExemption',
          params: [0, { commitment: 'confirmed' }],
        },
      },
    },
  };
};

/**
 * Gets the minimum balance for rent exemption in lamports for a given chain ID and selected account
 *
 * @param snapId - The snap ID to send the request to
 * @param messenger - The messaging system to use to call the snap controller
 * @returns The minimum balance for rent exemption in lamports
 */
export const getMinimumBalanceForRentExemptionInLamports = async (
  snapId: string,
  messenger: BridgeControllerMessenger,
) => {
  return String(
    await messenger
      .call(
        'SnapController:handleRequest',
        getMinimumBalanceForRentExemptionRequest(snapId),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .catch((error: any) => {
        console.error(
          'Error setting minimum balance for rent exemption',
          error,
        );
        return DEFAULT_BRIDGE_CONTROLLER_STATE.minimumBalanceForRentExemptionInLamports;
      }),
  );
};

/**
 * Creates a request to compute fees for a transaction using the new unified interface
 * Returns fees in native token amount (e.g., Solana instead of Lamports)
 *
 * @param snapId - The snap ID to send the request to
 * @param transaction - The base64 encoded transaction string
 * @param accountId - The account ID
 * @param scope - The CAIP-2 chain scope
 * @param options - Additional options to include in the request
 * @returns The snap request object
 */
export const computeFeeRequest = (
  snapId: string,
  transaction: string,
  accountId: string,
  scope: CaipChainId,
  options?: Record<string, unknown>,
) => {
  return {
    // TODO: remove 'as never' typing.
    snapId: snapId as never,
    origin: 'metamask',
    handler: 'onClientRequest' as never,
    request: {
      id: uuid(),
      jsonrpc: '2.0',
      method: 'computeFee',
      params: {
        transaction,
        accountId,
        scope,
        ...(options && { options }),
      },
    },
  };
};
