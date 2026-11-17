import { describe, expect, it } from 'vitest';

import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from '../data-sources/evm-rpc-services/utils/staking-contracts.js';
import type { Caip19AssetId } from '../types.js';
import { NATIVE_ASSETS } from './native-assets.js';
import { normalizeAssetId } from './normalizeAssetId.js';
import { resolvePriceLookupAssetId } from './resolvePriceLookupAssetId.js';

const mainnetVault = normalizeAssetId(
  `eip155:1/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:1']}`,
);

describe('resolvePriceLookupAssetId', () => {
  it.each([
    mainnetVault,
    mainnetVault.toLowerCase(),
    `eip155:1/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:1'].toUpperCase()}`,
  ])('uses native mainnet price for %s', (assetId) => {
    expect(resolvePriceLookupAssetId(assetId as Caip19AssetId)).toBe(
      NATIVE_ASSETS['eip155:1'],
    );
  });

  it.each([
    `eip155:560048/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:560048']}`,
    `eip155:10/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:1']}`,
    'eip155:1/erc20:0x1111111111111111111111111111111111111111',
    NATIVE_ASSETS['eip155:1'],
    'malformed',
  ])('preserves unrelated or unsupported price identifier %s', (assetId) => {
    expect(resolvePriceLookupAssetId(assetId as Caip19AssetId)).toBe(assetId);
  });
});
