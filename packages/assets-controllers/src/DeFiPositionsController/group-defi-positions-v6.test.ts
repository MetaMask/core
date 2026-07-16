import type { V6BalancesResponse } from '@metamask/core-backend';
import type { CaipAssetType } from '@metamask/utils';

import { groupDeFiPositionsV6 } from './group-defi-positions-v6';

const AAVE_METADATA = {
  protocolId: 'aave-v3',
  productName: 'Aave V3',
  description: 'Aave V3 on ethereum',
  protocolUrl: 'https://aave.com/',
  protocolIconUrl: 'https://example.com/aave.png',
  positionType: 'deposit',
  poolAddress: '0xpool',
  groupId: 'group-aave-1',
};

const WETH_ASSET_ID =
  'eip155:1/erc20:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as CaipAssetType;
const USDC_ASSET_ID =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as CaipAssetType;
const USDT_ASSET_ID =
  'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7' as CaipAssetType;
const BASE_WETH_ASSET_ID =
  'eip155:8453/erc20:0x4200000000000000000000000000000000000006' as CaipAssetType;

/**
 * Builds a minimal v6 balances response for tests.
 *
 * @param accounts - Account entries to include.
 * @returns A v6 balances response.
 */
function buildResponse(
  accounts: V6BalancesResponse['accounts'],
): V6BalancesResponse {
  return {
    unprocessedNetworks: [],
    unprocessedIncludeAssetIds: [],
    accounts,
  };
}

describe('groupDeFiPositionsV6', () => {
  it('groups DeFi positions by chain and protocolId', () => {
    const response = buildResponse([
      {
        accountId: 'eip155:0:0xabc',
        balances: [
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1',
            price: '2000',
            metadata: AAVE_METADATA,
          },
          {
            category: 'defi',
            assetId: USDC_ASSET_ID,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            balance: '100',
            price: '1',
            metadata: {
              ...AAVE_METADATA,
              positionType: 'deposit',
              poolAddress: '0xpool2',
            },
          },
          {
            category: 'defi',
            assetId: BASE_WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '2',
            price: '2000',
            metadata: AAVE_METADATA,
          },
        ],
      },
    ]);

    const result = groupDeFiPositionsV6(response);

    expect(Object.keys(result)).toStrictEqual(['eip155:0:0xabc']);
    expect(result['eip155:0:0xabc']).toHaveLength(2);

    const ethGroup = result['eip155:0:0xabc'].find(
      (group) => group.chainId === 'eip155:1',
    );
    const baseGroup = result['eip155:0:0xabc'].find(
      (group) => group.chainId === 'eip155:8453',
    );

    expect(ethGroup).toMatchObject({
      protocolId: 'aave-v3',
      productName: 'Aave V3',
      protocolIconUrl: 'https://example.com/aave.png',
      chainId: 'eip155:1',
      marketValue: 2100,
    });
    expect(ethGroup?.sections).toHaveLength(1);
    expect(ethGroup?.sections[0].positions).toHaveLength(2);

    expect(baseGroup).toMatchObject({
      protocolId: 'aave-v3',
      chainId: 'eip155:8453',
      marketValue: 4000,
    });
  });

  it('ignores token rows and defi rows without protocol metadata', () => {
    const response = buildResponse([
      {
        accountId: 'account-1',
        balances: [
          {
            category: 'token',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1',
            price: '2000',
          },
          {
            category: 'defi',
            assetId: USDC_ASSET_ID,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            balance: '100',
            price: '1',
          },
          {
            category: 'defi',
            assetId: USDT_ASSET_ID,
            name: 'Tether',
            symbol: 'USDT',
            decimals: 6,
            balance: '50',
            price: '1',
            metadata: {
              limit: '1',
            },
          },
        ],
      },
    ]);

    const result = groupDeFiPositionsV6(response);

    expect(result['account-1']).toStrictEqual([]);
  });

  it('seeds an empty list for accounts with no DeFi positions', () => {
    const response = buildResponse([
      {
        accountId: 'account-empty',
        balances: [],
      },
    ]);

    expect(groupDeFiPositionsV6(response)).toStrictEqual({
      'account-empty': [],
    });
  });

  it('skips accounts that do not resolve to an internal account ID', () => {
    const response = buildResponse([
      {
        accountId: 'eip155:0:0xunknown',
        balances: [
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1',
            price: '2000',
            metadata: AAVE_METADATA,
          },
        ],
      },
      {
        accountId: 'eip155:0:0xknown',
        balances: [
          {
            category: 'defi',
            assetId: USDC_ASSET_ID,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            balance: '10',
            price: '1',
            metadata: AAVE_METADATA,
          },
        ],
      },
    ]);

    const result = groupDeFiPositionsV6(response, (responseAccountId) =>
      responseAccountId === 'eip155:0:0xknown' ? 'internal-1' : undefined,
    );

    expect(Object.keys(result)).toStrictEqual(['internal-1']);
    expect(result['internal-1']).toHaveLength(1);
  });

  it('omits market value when price is missing or invalid', () => {
    const response = buildResponse([
      {
        accountId: 'account-1',
        balances: [
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1',
            metadata: AAVE_METADATA,
          },
          {
            category: 'defi',
            assetId: USDC_ASSET_ID,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            balance: 'not-a-number',
            price: '1',
            metadata: {
              ...AAVE_METADATA,
              productName: 'Aave V3 USDC',
            },
          },
          {
            category: 'defi',
            assetId: USDT_ASSET_ID,
            name: 'Tether',
            symbol: 'USDT',
            decimals: 6,
            balance: '5',
            price: '1',
            metadata: {
              ...AAVE_METADATA,
              productName: 'Aave V3 USDT',
            },
          },
        ],
      },
    ]);

    const [group] = groupDeFiPositionsV6(response)['account-1'];

    expect(group.marketValue).toBe(5);
    expect(group.sections[0].positions[0].marketValue).toBeUndefined();
    expect(group.sections[1].positions[0].marketValue).toBeUndefined();
    expect(group.sections[2].positions[0].marketValue).toBe(5);
  });

  it('subtracts lending positions from the protocol market value', () => {
    const response = buildResponse([
      {
        accountId: 'account-1',
        balances: [
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1',
            price: '2000',
            metadata: {
              ...AAVE_METADATA,
              productName: 'Aave V3 Supply',
              positionType: 'deposit',
            },
          },
          {
            category: 'defi',
            assetId: USDC_ASSET_ID,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            balance: '500',
            price: '1',
            metadata: {
              ...AAVE_METADATA,
              productName: 'Aave V3 Borrow',
              positionType: 'lending',
            },
          },
        ],
      },
    ]);

    const [group] = groupDeFiPositionsV6(response)['account-1'];

    expect(group.marketValue).toBe(1500);
    expect(group.sections[0].positions[0].marketValue).toBe(2000);
    expect(group.sections[1].positions[0].marketValue).toBe(500);
    expect(group.sections[1].positions[0].positionType).toBe('lending');
  });

  it('creates separate detail sections per productName under one protocolId', () => {
    const response = buildResponse([
      {
        accountId: 'account-1',
        balances: [
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1',
            price: '2000',
            metadata: {
              ...AAVE_METADATA,
              productName: 'Aave V3 Supply',
            },
          },
          {
            category: 'defi',
            assetId: USDC_ASSET_ID,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            balance: '100',
            price: '1',
            metadata: {
              ...AAVE_METADATA,
              productName: 'Aave V3 Borrow',
              positionType: 'lending',
            },
          },
        ],
      },
    ]);

    const [group] = groupDeFiPositionsV6(response)['account-1'];

    expect(group.productName).toBe('Aave V3 Supply');
    expect(group.sections).toStrictEqual([
      {
        productName: 'Aave V3 Supply',
        positions: [
          expect.objectContaining({
            symbol: 'WETH',
            positionType: 'deposit',
          }),
        ],
      },
      {
        productName: 'Aave V3 Borrow',
        positions: [
          expect.objectContaining({
            symbol: 'USDC',
            positionType: 'lending',
          }),
        ],
      },
    ]);
  });

  it('dedupes icon-group symbols and moves ETH/WETH to the front', () => {
    const response = buildResponse([
      {
        accountId: 'account-1',
        balances: [
          {
            category: 'defi',
            assetId: USDC_ASSET_ID,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            balance: '100',
            price: '1',
            metadata: AAVE_METADATA,
          },
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1',
            price: '2000',
            metadata: AAVE_METADATA,
          },
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '0.5',
            price: '2000',
            metadata: {
              ...AAVE_METADATA,
              positionType: 'rewards',
            },
          },
        ],
      },
    ]);

    const [group] = groupDeFiPositionsV6(response)['account-1'];

    expect(group.iconGroup.map((item) => item.symbol)).toStrictEqual([
      'WETH',
      'USDC',
    ]);
    expect(group.iconGroup[0].avatarValue).toBe(
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
    );
  });

  it('builds underlying positions with token images and chain IDs', () => {
    const response = buildResponse([
      {
        accountId: 'account-1',
        balances: [
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1.5',
            price: '2000',
            metadata: AAVE_METADATA,
          },
        ],
      },
    ]);

    const [group] = groupDeFiPositionsV6(response)['account-1'];
    const [position] = group.sections[0].positions;

    expect(position).toStrictEqual({
      assetId: WETH_ASSET_ID,
      chainId: 'eip155:1',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      balance: '1.5',
      marketValue: 3000,
      positionType: 'deposit',
      poolAddress: '0xpool',
      groupId: 'group-aave-1',
      tokenImage:
        'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
    });
  });

  it('keeps distinct groupIds on positions that share a productName', () => {
    const response = buildResponse([
      {
        accountId: 'account-1',
        balances: [
          {
            category: 'defi',
            assetId: WETH_ASSET_ID,
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            balance: '1',
            price: '2000',
            metadata: {
              ...AAVE_METADATA,
              productName: 'Pendle YT',
              groupId: 'group-yt-1',
            },
          },
          {
            category: 'defi',
            assetId: USDC_ASSET_ID,
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            balance: '100',
            price: '1',
            metadata: {
              ...AAVE_METADATA,
              productName: 'Pendle YT',
              poolAddress: '0xpool2',
              groupId: 'group-yt-2',
            },
          },
        ],
      },
    ]);

    const [group] = groupDeFiPositionsV6(response)['account-1'];

    expect(group.sections).toHaveLength(1);
    expect(group.sections[0].productName).toBe('Pendle YT');
    expect(group.sections[0].positions.map((p) => p.groupId)).toStrictEqual([
      'group-yt-1',
      'group-yt-2',
    ]);
  });
});
