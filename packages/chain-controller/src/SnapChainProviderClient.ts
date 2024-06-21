import type {
  Chain,
  CaipAssetTypeOrId,
  BalancesResult,
} from '@metamask/chain-api';
import { ChainRpcMethod } from '@metamask/chain-api';
import type { CaipChainId } from '@metamask/utils';

import type { SnapHandlerClient } from './SnapHandlerClient';

/**
 * Snap client that implement the Chain API.
 */
export class SnapChainProviderClient implements Chain {
  #client: SnapHandlerClient;

  /**
   * Constructor for `SnapChainProviderClient`.
   *
   * @param client - A Snap handler client.
   */
  constructor(client: SnapHandlerClient) {
    this.#client = client;
  }

  /**
   * Fetches asset balances for each given accounts.
   *
   * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
   * @param accounts - Accounts (addresses).
   * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
   * @returns Assets balances for each accounts.
   */
  getBalances = async (
    scope: CaipChainId,
    accounts: string[],
    assets: CaipAssetTypeOrId[],
  ): Promise<BalancesResult> => {
    return (await this.#client.submitRequest(ChainRpcMethod.GetBalances, {
      scope,
      accounts,
      assets,
    })) as BalancesResult;
  };
}
