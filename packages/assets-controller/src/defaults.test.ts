import { describe, expect, it } from 'vitest';

import { isMusdAssetId } from './defaults.js';

const address = '0xacA92E438df0B2401fF60dA7E4337B687a2435DA';

describe('isMusdAssetId', () => {
  it.each(['1', '56', '59144', '143', '999999'])(
    'recognizes the exact address on EVM chain %s regardless of address casing',
    (chain) => {
      expect(isMusdAssetId(`eip155:${chain}/erc20:${address}`)).toBe(true);
      expect(
        isMusdAssetId(`eip155:${chain}/erc20:${address.toLowerCase()}`),
      ).toBe(true);
    },
  );

  it.each([
    `eip155:56/erc20:${address}00`,
    `eip155:56/erc20:${address}/extra`,
    `eip155:56/erc721:${address}`,
    `solana:example/erc20:${address}`,
    'eip155:56/erc20:0x0000000000000000000000000000000000000001',
  ])('does not exempt a different asset %s', (assetId) => {
    expect(isMusdAssetId(assetId)).toBe(false);
  });
});
