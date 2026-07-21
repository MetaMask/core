import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type {
  DeFiProtocolPositionGroup,
  DeFiUnderlyingPosition,
} from './group-defi-positions-v6';
import { mergePositionsForAccounts } from './merge-positions-for-accounts';

const ETH_MAINNET = 'eip155:1' as CaipChainId;
const BASE = 'eip155:8453' as CaipChainId;

const WETH_ASSET_ID =
  'eip155:1/erc20:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as CaipAssetType;
const USDC_ASSET_ID =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as CaipAssetType;

/**
 * Builds an underlying position for tests.
 *
 * @param overrides - Fields to override on the default position.
 * @returns An underlying position.
 */
function buildPosition(
  overrides: Partial<DeFiUnderlyingPosition> = {},
): DeFiUnderlyingPosition {
  return {
    assetId: WETH_ASSET_ID,
    chainId: ETH_MAINNET,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    balance: '1',
    marketValue: 2000,
    positionType: 'deposit',
    poolAddress: '0xpool',
    groupId: 'group-1',
    tokenImage: 'https://example.com/weth.png',
    ...overrides,
  };
}

/**
 * Builds a protocol position group for tests.
 *
 * @param overrides - Fields to override on the default group.
 * @returns A protocol position group.
 */
function buildGroup(
  overrides: Partial<DeFiProtocolPositionGroup> = {},
): DeFiProtocolPositionGroup {
  return {
    protocolId: 'aave-v3',
    productName: 'Aave V3',
    protocolIconUrl: 'https://example.com/aave.png',
    chainId: ETH_MAINNET,
    marketValue: 2000,
    iconGroup: [
      { symbol: 'WETH', avatarValue: 'https://example.com/weth.png' },
    ],
    sections: [{ productName: 'Aave V3', positions: [buildPosition()] }],
    ...overrides,
  };
}

describe('mergePositionsForAccounts', () => {
  it('returns an empty list when no accounts have positions', () => {
    expect(mergePositionsForAccounts({}, ['account-1'])).toStrictEqual([]);
  });

  it('returns a single account’s groups unchanged in content', () => {
    const group = buildGroup();

    const result = mergePositionsForAccounts({ 'account-1': [group] }, [
      'account-1',
    ]);

    expect(result).toStrictEqual([group]);
  });

  it('does not mutate the source groups held in state', () => {
    const group = buildGroup();
    const positionsByAccount = { 'account-1': [group] };

    const result = mergePositionsForAccounts(positionsByAccount, ['account-1']);
    result[0].marketValue = 999;
    result[0].iconGroup.push({ symbol: 'HACK' });
    result[0].sections.push({ productName: 'HACK', positions: [] });
    result[0].sections[0].positions.push(buildPosition({ symbol: 'HACK' }));

    expect(group.marketValue).toBe(2000);
    expect(group.iconGroup).toHaveLength(1);
    expect(group.sections).toHaveLength(1);
    expect(group.sections[0].positions).toHaveLength(1);
  });

  it('keeps groups on the same protocol but different chains separate', () => {
    const ethGroup = buildGroup({ chainId: ETH_MAINNET });
    const baseGroup = buildGroup({ chainId: BASE });

    const result = mergePositionsForAccounts(
      { 'account-1': [ethGroup], 'account-2': [baseGroup] },
      ['account-1', 'account-2'],
    );

    expect(result).toHaveLength(2);
    expect(result.map((group) => group.chainId)).toStrictEqual([
      ETH_MAINNET,
      BASE,
    ]);
  });

  it('merges groups that share chain and protocol across accounts', () => {
    const groupA = buildGroup({
      marketValue: 2000,
      iconGroup: [{ symbol: 'WETH' }],
      sections: [
        {
          productName: 'Aave V3',
          positions: [buildPosition({ symbol: 'WETH' })],
        },
      ],
    });
    const groupB = buildGroup({
      marketValue: 500,
      iconGroup: [{ symbol: 'USDC' }],
      sections: [
        {
          productName: 'Aave V3',
          positions: [
            buildPosition({ symbol: 'USDC', assetId: USDC_ASSET_ID }),
          ],
        },
      ],
    });

    const result = mergePositionsForAccounts(
      { 'account-1': [groupA], 'account-2': [groupB] },
      ['account-1', 'account-2'],
    );

    expect(result).toHaveLength(1);
    expect(result[0].marketValue).toBe(2500);
    expect(result[0].iconGroup.map((icon) => icon.symbol)).toStrictEqual([
      'WETH',
      'USDC',
    ]);
    expect(result[0].sections).toHaveLength(1);
    expect(result[0].sections[0].positions).toHaveLength(2);
  });

  it('deduplicates icon entries that share a symbol when merging', () => {
    const groupA = buildGroup({ iconGroup: [{ symbol: 'WETH' }] });
    const groupB = buildGroup({ iconGroup: [{ symbol: 'WETH' }] });

    const result = mergePositionsForAccounts(
      { 'account-1': [groupA], 'account-2': [groupB] },
      ['account-1', 'account-2'],
    );

    expect(result[0].iconGroup).toHaveLength(1);
  });

  it('ignores account IDs that are not in the selected group', () => {
    const result = mergePositionsForAccounts(
      { 'account-1': [buildGroup()], 'account-2': [buildGroup()] },
      ['account-1'],
    );

    expect(result).toHaveLength(1);
  });

  it('keeps sections with distinct productNames separate when merging', () => {
    const groupA = buildGroup({
      sections: [
        {
          productName: 'Aave V3',
          positions: [buildPosition({ symbol: 'WETH' })],
        },
      ],
    });
    const groupB = buildGroup({
      sections: [
        {
          productName: 'Pendle',
          positions: [buildPosition({ symbol: 'USDC', assetId: USDC_ASSET_ID })],
        },
      ],
    });

    const result = mergePositionsForAccounts(
      { 'account-1': [groupA], 'account-2': [groupB] },
      ['account-1', 'account-2'],
    );

    expect(result).toHaveLength(1);
    expect(result[0].sections.map((section) => section.productName)).toStrictEqual(
      ['Aave V3', 'Pendle'],
    );
  });
});
