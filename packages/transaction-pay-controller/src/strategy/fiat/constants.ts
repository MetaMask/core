import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_MAINNET,
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
} from '../../constants';

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

/** Chain ID for Monad network. */
export const CHAIN_ID_MONAD = '0x8f' as Hex;

/** mUSD token address on Monad (same address across all supported chains). */
export const MUSD_MONAD_ADDRESS =
  '0xaca92e438df0b2401ff60da7e4337b687a2435da' as Hex;

/** Fiat asset descriptor for mUSD on Monad. */
export const MUSD_MONAD_FIAT_ASSET: TransactionPayFiatAsset = {
  address: MUSD_MONAD_ADDRESS,
  chainId: CHAIN_ID_MONAD,
};

/** Fixed USD amount used to probe whether any fiat provider can sell mUSD on Monad. */
export const MUSD_PROBE_AMOUNT_USD = 50;
