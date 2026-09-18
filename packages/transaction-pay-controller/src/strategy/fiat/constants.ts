import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_MAINNET,
  CHAIN_ID_MONAD,
  CHAIN_ID_POLYGON,
  MUSD_MONAD_ADDRESS,
  NATIVE_TOKEN_ADDRESS,
} from '../../constants.js';

export const DEFAULT_FIAT_CURRENCY = 'USD';

export type TransactionPayFiatAsset = {
  address: Hex;
  chainId: Hex;
};

const POLYGON_POL_FIAT_ASSET: TransactionPayFiatAsset = {
  address: '0x0000000000000000000000000000000000001010',
  chainId: CHAIN_ID_POLYGON,
};

const ARBITRUM_ETH_FIAT_ASSET: TransactionPayFiatAsset = {
  address: NATIVE_TOKEN_ADDRESS,
  chainId: CHAIN_ID_ARBITRUM,
};

export const ETH_MAINNET_FIAT_ASSET: TransactionPayFiatAsset = {
  address: NATIVE_TOKEN_ADDRESS,
  chainId: CHAIN_ID_MAINNET,
};

export const FIAT_ASSET_ID_BY_TX_TYPE: Partial<
  Record<TransactionType, TransactionPayFiatAsset>
> = {
  [TransactionType.moneyAccountDeposit]: ETH_MAINNET_FIAT_ASSET,
  [TransactionType.perpsDeposit]: ARBITRUM_ETH_FIAT_ASSET,
  [TransactionType.predictDeposit]: POLYGON_POL_FIAT_ASSET,
};

export const FIAT_ENABLED_TYPES: TransactionType[] = [
  TransactionType.moneyAccountDeposit,
  TransactionType.perpsDeposit,
  TransactionType.predictDeposit,
];

/** Fiat asset descriptor for mUSD on Monad. */
export const MUSD_MONAD_FIAT_ASSET: TransactionPayFiatAsset = {
  address: MUSD_MONAD_ADDRESS,
  chainId: CHAIN_ID_MONAD,
};
