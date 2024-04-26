import type {
  Chain,
  CaipAssetTypeOrId,
  BalancesResult,
} from '@metamask/chain-api';
import { ChainRpcMethod } from '@metamask/chain-api';
import type { CaipChainId } from '@metamask/utils';

import type { SnapControllerClient } from './SnapControllerClient';

/**
 * Snap client to submit requests through the `SnapController`.
 */
export class SnapChainProviderClient implements Chain {
  #client: SnapControllerClient;

  constructor(client: SnapControllerClient) {
    this.#client = client;
  }

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
