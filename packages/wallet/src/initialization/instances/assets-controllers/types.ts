import type {
  AccountTrackerController,
  CurrencyRateController,
  DeFiPositionsController,
  MultichainAssetsController,
  MultichainAssetsRatesController,
  MultichainBalancesController,
  NftController,
  RatesController,
  TokenBalancesControllerOptions,
  TokenDetectionController,
  TokenListController,
  TokenRatesController,
  TokensController,
  TokenSearchDiscoveryDataController,
} from '@metamask/assets-controllers';
import type { Hex } from '@metamask/utils';

type ConstructorOptions<
  Controller extends abstract new (...args: never) => unknown,
> = ConstructorParameters<Controller>[0];

type TokenDetectionControllerOptions = ConstructorOptions<
  typeof TokenDetectionController
>;

/**
 * Per-instance options for the wallet's `AccountTrackerController`. Every
 * field falls back to the controller's own default.
 * `getStakedBalanceForChain` is wired to `AssetsContractController` through
 * the messenger.
 */
export type AccountTrackerControllerInstanceOptions = Omit<
  ConstructorOptions<typeof AccountTrackerController>,
  'messenger' | 'state' | 'getStakedBalanceForChain'
>;

/**
 * Per-instance options for the wallet's `AssetsContractController`.
 */
export type AssetsContractControllerInstanceOptions = {
  /**
   * The chain the controller starts on, until the selected network is read.
   * Defaults to Ethereum mainnet.
   */
  chainId?: Hex;
};

/**
 * Per-instance options for the wallet's `CurrencyRateController`. Every field
 * falls back to the controller's own default; `tokenPricesService` defaults
 * to a `CodefiTokenPricesServiceV2`.
 */
export type CurrencyRateControllerInstanceOptions = Partial<
  Omit<ConstructorOptions<typeof CurrencyRateController>, 'messenger' | 'state'>
>;

/**
 * Per-instance options for the wallet's `DeFiPositionsController`. Every
 * field falls back to the controller's own default.
 */
export type DeFiPositionsControllerInstanceOptions = Omit<
  ConstructorOptions<typeof DeFiPositionsController>,
  'messenger'
>;

/**
 * Per-instance options for the wallet's `MultichainAssetsController`. Every
 * field falls back to the controller's own default.
 */
export type MultichainAssetsControllerInstanceOptions = Omit<
  ConstructorOptions<typeof MultichainAssetsController>,
  'messenger' | 'state'
>;

/**
 * Per-instance options for the wallet's `MultichainAssetsRatesController`.
 * Every field falls back to the controller's own default.
 */
export type MultichainAssetsRatesControllerInstanceOptions = Omit<
  ConstructorOptions<typeof MultichainAssetsRatesController>,
  'messenger' | 'state'
>;

/**
 * Per-instance options for the wallet's `MultichainBalancesController`. Every
 * field falls back to the controller's own default.
 */
export type MultichainBalancesControllerInstanceOptions = Omit<
  ConstructorOptions<typeof MultichainBalancesController>,
  'messenger' | 'state'
>;

/**
 * Per-instance options for the wallet's `NftController`. Every field falls
 * back to the controller's own default.
 */
export type NftControllerInstanceOptions = Omit<
  ConstructorOptions<typeof NftController>,
  'messenger' | 'state'
>;

/**
 * Per-instance options for the wallet's `NftDetectionController`.
 * `addNfts`, `removeNft` and `getNftState` are wired to `NftController`
 * through the messenger.
 */
export type NftDetectionControllerInstanceOptions = {
  /** Whether NFT detection is disabled. Defaults to `false`. */
  disabled?: boolean;
};

/**
 * Per-instance options for the wallet's `RatesController`. Every field falls
 * back to the controller's own default; `includeUsdRate` defaults to `false`.
 */
export type RatesControllerInstanceOptions = Partial<
  Omit<ConstructorOptions<typeof RatesController>, 'messenger' | 'state'>
>;

/**
 * Per-instance options for the wallet's `TokenBalancesController`. Every
 * field falls back to the controller's own default.
 */
export type TokenBalancesControllerInstanceOptions = Omit<
  TokenBalancesControllerOptions,
  'messenger' | 'state'
>;

/**
 * Per-instance options for the wallet's `TokenDetectionController`. Every
 * field falls back to the controller's own default; `tokenListService`
 * defaults to a `TokenListService` and `trackMetaMetricsEvent` to a no-op.
 * `getBalancesInSingleCall` is wired to `AssetsContractController` through
 * the messenger.
 */
export type TokenDetectionControllerInstanceOptions = Omit<
  TokenDetectionControllerOptions,
  | 'messenger'
  | 'getBalancesInSingleCall'
  | 'tokenListService'
  | 'trackMetaMetricsEvent'
> &
  Partial<
    Pick<
      TokenDetectionControllerOptions,
      'tokenListService' | 'trackMetaMetricsEvent'
    >
  >;

/**
 * Per-instance options for the wallet's `TokenListController`. Every field
 * falls back to the controller's own default; `chainId` defaults to Ethereum
 * mainnet.
 */
export type TokenListControllerInstanceOptions = Partial<
  Omit<ConstructorOptions<typeof TokenListController>, 'messenger' | 'state'>
>;

/**
 * Per-instance options for the wallet's `TokenRatesController`. Every field
 * falls back to the controller's own default; `tokenPricesService` defaults
 * to a `CodefiTokenPricesServiceV2`.
 */
export type TokenRatesControllerInstanceOptions = Partial<
  Omit<ConstructorOptions<typeof TokenRatesController>, 'messenger' | 'state'>
>;

/**
 * Per-instance options for the wallet's `TokensController`. Every field falls
 * back to the controller's own default; `tokenListService` defaults to a
 * `TokenListService`. Without a `provider`, the selected network client's
 * provider is used.
 */
export type TokensControllerInstanceOptions = Partial<
  Omit<ConstructorOptions<typeof TokensController>, 'messenger' | 'state'>
>;

/**
 * Per-instance options for the wallet's `TokenSearchDiscoveryDataController`.
 * `tokenPricesService` defaults to a `CodefiTokenPricesServiceV2`.
 */
export type TokenSearchDiscoveryDataControllerInstanceOptions = Partial<
  Omit<
    ConstructorOptions<typeof TokenSearchDiscoveryDataController>,
    'messenger' | 'state'
  >
>;
