import type { AssetsControllerState, DataResponse } from '../types.js';
import { getIgnoringCase } from './test-utils.js';

/**
 * A named projection of one asset surface (`balances`, `metadata`, `prices`,
 * …) out of a source, so integration suites can drive assertions over the
 * same surfaces with `it.each([BALANCES, METADATA, PRICES])`.
 */
export type AssetSurface<Source> = {
  surface: string;
  lookUp: (source: Source, assetId: string) => unknown;
};

/** An `AssetSurface` over persisted `AssetsController` state. */
export type StateSurface = AssetSurface<AssetsControllerState>;

/** An `AssetSurface` over an assets-pipeline `DataResponse`. */
export type ResponseSurface = AssetSurface<DataResponse>;

/** A balances surface with the extra helpers the stale-balance suites use. */
export type BalancesSurface<Source> = AssetSurface<Source> & {
  getAssetIds: (source: Source) => Set<string>;
  lookupAmount: (source: Source, assetId: string) => string | undefined;
};

/**
 * Build the `balances` surface over one account's balance record.
 *
 * @param selectBalances - Reads the account's balances from the source.
 * @returns The balances surface.
 */
export const buildBalancesSurface = <Source>(
  selectBalances: (source: Source) => Record<string, unknown> | undefined,
): BalancesSurface<Source> => {
  const recordOf = (source: Source): Record<string, unknown> =>
    selectBalances(source) ?? {};

  return {
    surface: 'balances',
    lookUp: (source, assetId) => getIgnoringCase(recordOf(source), assetId),
    getAssetIds: (source) =>
      new Set(Object.keys(recordOf(source)).map((key) => key.toLowerCase())),
    lookupAmount: (source, assetId) =>
      (
        getIgnoringCase(recordOf(source), assetId) as
          | { amount?: string }
          | undefined
      )?.amount,
  };
};

/**
 * Build the `metadata` surface over an asset-info record.
 *
 * @param selectMetadata - Reads the asset info from the source.
 * @returns The metadata surface.
 */
export const buildMetadataSurface = <Source>(
  selectMetadata: (source: Source) => Record<string, unknown> | undefined,
): AssetSurface<Source> => ({
  surface: 'metadata',
  lookUp: (source, assetId) =>
    getIgnoringCase(selectMetadata(source) ?? {}, assetId),
});

/**
 * Build the `prices` surface over an asset-price record.
 *
 * @param selectPrices - Reads the asset prices from the source.
 * @returns The prices surface.
 */
export const buildPricesSurface = <Source>(
  selectPrices: (source: Source) => Record<string, unknown> | undefined,
): AssetSurface<Source> => ({
  surface: 'prices',
  lookUp: (source, assetId) =>
    getIgnoringCase(selectPrices(source) ?? {}, assetId),
});

/**
 * The `balances` surface over `AssetsController` state for one account.
 *
 * @param accountId - The account whose balance record to inspect.
 * @returns The balances surface.
 */
export const stateBalancesSurface = (
  accountId: string,
): BalancesSurface<AssetsControllerState> =>
  buildBalancesSurface(
    (state: AssetsControllerState) => state.assetsBalance[accountId],
  );

/** The `metadata` surface over `AssetsController` state. */
export const STATE_METADATA_SURFACE: StateSurface = buildMetadataSurface(
  (state: AssetsControllerState) => state.assetsInfo,
);

/** The `prices` surface over `AssetsController` state. */
export const STATE_PRICES_SURFACE: StateSurface = buildPricesSurface(
  (state: AssetsControllerState) => state.assetsPrice,
);

/**
 * The `balances` surface over a pipeline `DataResponse` for one account.
 *
 * @param accountId - The account whose balance record to inspect.
 * @returns The balances surface.
 */
export const responseBalancesSurface = (
  accountId: string,
): AssetSurface<DataResponse> =>
  buildBalancesSurface(
    (response: DataResponse) => response.assetsBalance?.[accountId],
  );

/** The `metadata` surface over a pipeline `DataResponse`. */
export const RESPONSE_METADATA_SURFACE: ResponseSurface = buildMetadataSurface(
  (response: DataResponse) => response.assetsInfo,
);

/** The `prices` surface over a pipeline `DataResponse`. */
export const RESPONSE_PRICES_SURFACE: ResponseSurface = buildPricesSurface(
  (response: DataResponse) => response.assetsPrice,
);
