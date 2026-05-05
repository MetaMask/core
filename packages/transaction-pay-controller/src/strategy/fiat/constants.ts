import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
} from '../../constants';

export const DEFAULT_FIAT_CURRENCY = 'USD';

export type TransactionPayFiatAsset = {
  address: Hex;
  caipAssetId: string;
  chainId: Hex;
  decimals: number;
};

const POLYGON_POL_FIAT_ASSET: TransactionPayFiatAsset = {
  address: '0x0000000000000000000000000000000000001010',
  caipAssetId: 'eip155:137/slip44:966',
  chainId: CHAIN_ID_POLYGON,
  decimals: 18,
};

const ARBITRUM_ETH_FIAT_ASSET: TransactionPayFiatAsset = {
  address: NATIVE_TOKEN_ADDRESS,
  caipAssetId: 'eip155:42161/slip44:60',
  chainId: CHAIN_ID_ARBITRUM,
  decimals: 18,
};

// We might use feature flags to determine these later.
export const FIAT_ASSET_ID_BY_TX_TYPE: Partial<
  Record<TransactionType, TransactionPayFiatAsset>
> = {
  [TransactionType.predictDeposit]: POLYGON_POL_FIAT_ASSET,
  [TransactionType.perpsDeposit]: ARBITRUM_ETH_FIAT_ASSET,
  [TransactionType.perpsDepositAndOrder]: ARBITRUM_ETH_FIAT_ASSET,
};
