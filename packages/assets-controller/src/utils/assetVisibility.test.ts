import { getDefaultTrackedAssetsForChain } from '../defaults.js';
import type {
  AssetsControllerState,
  Caip19AssetId,
  ChainId,
} from '../types.js';
import { getAssetVisibility } from './assetVisibility.js';
import { normalizeAssetId } from './normalizeAssetId.js';

const MAINNET = 'eip155:1' as ChainId;
const GNOSIS = 'eip155:100' as ChainId;
const MAINNET_NATIVE = 'eip155:1/slip44:60' as Caip19AssetId;
const GNOSIS_NATIVE =
  'eip155:100/erc20:0x0000000000000000000000000000000000000000' as Caip19AssetId;
const PIN =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const PIN_MIXED_CASE =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19d4a2e9eB0cE3606eB48' as Caip19AssetId;
const OUT_OF_SCOPE_PIN =
  'eip155:137/erc20:0x0000000000000000000000000000000000001010' as Caip19AssetId;
const STAKING_ASSET =
  'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df' as Caip19AssetId;
const [MAINNET_DEFAULT] = getDefaultTrackedAssetsForChain(MAINNET);

function createState(
  overrides: Partial<AssetsControllerState> = {},
): AssetsControllerState {
  return {
    assetsInfo: {},
    assetsBalance: {},
    assetsPrice: {},
    customAssets: {},
    assetPreferences: {},
    selectedCurrency: 'usd',
    ...overrides,
  };
}

function getNativeAssetForChain(chainId: ChainId): Caip19AssetId {
  if (chainId === MAINNET) {
    return MAINNET_NATIVE;
  }
  if (chainId === GNOSIS) {
    return GNOSIS_NATIVE;
  }
  throw new Error(`Unknown chain: ${chainId}`);
}

describe('getAssetVisibility', () => {
  it('returns normalized native, pinned, and default tracked assets', () => {
    const state = createState({
      customAssets: {
        account1: [PIN, PIN, OUT_OF_SCOPE_PIN],
        account2: [PIN],
      },
    });

    const result = getAssetVisibility({
      state,
      accountIds: ['account1', 'account2'],
      chainIds: [MAINNET, GNOSIS],
      getNativeAssetForChain,
    });

    expect(result.visibleAssetIds).toStrictEqual([
      MAINNET_NATIVE,
      MAINNET_DEFAULT,
      normalizeAssetId(GNOSIS_NATIVE),
      normalizeAssetId(PIN),
    ]);
    expect(result.hiddenAssetIds).toStrictEqual([]);
  });

  it('lets hidden preferences override every visible category', () => {
    const state = createState({
      customAssets: { account1: [PIN] },
      assetPreferences: {
        [MAINNET_NATIVE]: { hidden: true },
        [PIN_MIXED_CASE]: { hidden: true },
        [MAINNET_DEFAULT]: { hidden: true },
      },
    });

    const result = getAssetVisibility({
      state,
      accountIds: ['account1'],
      chainIds: [MAINNET],
      getNativeAssetForChain,
    });

    expect(result.visibleAssetIds).toStrictEqual([]);
    expect(result.hiddenAssetIds).toStrictEqual([
      MAINNET_NATIVE,
      normalizeAssetId(PIN_MIXED_CASE),
      MAINNET_DEFAULT,
    ]);
  });

  it('scopes hidden assets to requested chains', () => {
    const state = createState({
      assetPreferences: {
        [PIN]: { hidden: true },
        [OUT_OF_SCOPE_PIN]: { hidden: true },
      },
    });

    const result = getAssetVisibility({
      state,
      accountIds: [],
      chainIds: [MAINNET],
      getNativeAssetForChain,
    });

    expect(result.hiddenAssetIds).toStrictEqual([normalizeAssetId(PIN)]);
  });

  it('skips malformed and staking-position pins', () => {
    const state = createState({
      customAssets: {
        account1: ['not-an-asset-id' as Caip19AssetId, STAKING_ASSET],
      },
      assetPreferences: {
        'also-not-an-asset-id': { hidden: true },
      },
    });

    const result = getAssetVisibility({
      state,
      accountIds: ['account1'],
      chainIds: [MAINNET],
      getNativeAssetForChain,
    });

    expect(result.visibleAssetIds).toStrictEqual([
      MAINNET_NATIVE,
      MAINNET_DEFAULT,
    ]);
    expect(result.hiddenAssetIds).toStrictEqual([]);
  });

  it('omits native on chains that have no native token', () => {
    const tempo = 'eip155:42431' as ChainId;
    const tempoNative = `${tempo}/slip44:60` as Caip19AssetId;
    const tempoPin =
      `${tempo}/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` as Caip19AssetId;

    const result = getAssetVisibility({
      state: createState({
        customAssets: { account1: [tempoPin] },
      }),
      accountIds: ['account1'],
      chainIds: [tempo],
      getNativeAssetForChain: () => tempoNative,
    });

    expect(result.visibleAssetIds).toStrictEqual([normalizeAssetId(tempoPin)]);
    expect(result.hiddenAssetIds).toStrictEqual([]);
  });
});
