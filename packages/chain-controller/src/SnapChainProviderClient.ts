import type {
  Chain,
  CaipAssetTypeOrId,
  BalancesResult,
} from '@metamask/chain-api';
import { ChainRpcMethod } from '@metamask/chain-api';
import type { CaipChainId } from '@metamask/utils';

import type { SnapHandlerClient } from './SnapHandlerClient';

/**
 * Snap client to submit requests through the `SnapController`.
 */
export class SnapChainProviderClient implements Chain {
  #client: SnapHandlerClient;

  constructor(client: SnapHandlerClient) {
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
