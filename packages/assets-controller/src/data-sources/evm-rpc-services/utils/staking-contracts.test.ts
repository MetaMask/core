import {
  getNativeAssetIdForStakedAsset,
  resolvePriceLookupAssetId,
  STAKING_CONTRACT_ADDRESS_BY_CHAINID,
} from './staking-contracts.js';

describe('getNativeAssetIdForStakedAsset', () => {
  it('resolves the mainnet staking vault to the mainnet native asset', () => {
    expect(
      getNativeAssetIdForStakedAsset(
        `eip155:1/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:1']}`,
      ),
    ).toBe('eip155:1/slip44:60');
  });

  it('resolves the Hoodi staking vault to the Hoodi native asset', () => {
    expect(
      getNativeAssetIdForStakedAsset(
        `eip155:560048/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:560048']}`,
      ),
    ).toBe('eip155:560048/slip44:60');
  });

  it('is case-insensitive on the contract address', () => {
    const upper = STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:1'].toUpperCase();
    expect(getNativeAssetIdForStakedAsset(`eip155:1/erc20:${upper}`)).toBe(
      'eip155:1/slip44:60',
    );
  });

  it('returns undefined for the mainnet staking address on an unrelated chain', () => {
    // Same contract address, wrong chain — must not resolve.
    expect(
      getNativeAssetIdForStakedAsset(
        `eip155:137/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:1']}`,
      ),
    ).toBeUndefined();
  });

  it('returns undefined for an unrelated erc20 on a known staking chain', () => {
    expect(
      getNativeAssetIdForStakedAsset(
        'eip155:1/erc20:0x9999999999999999999999999999999999999999',
      ),
    ).toBeUndefined();
  });

  it('returns undefined for a non-erc20 asset (e.g. native)', () => {
    expect(
      getNativeAssetIdForStakedAsset('eip155:1/slip44:60'),
    ).toBeUndefined();
  });

  it('returns undefined for a malformed asset ID', () => {
    expect(getNativeAssetIdForStakedAsset('not-a-caip-id')).toBeUndefined();
    expect(getNativeAssetIdForStakedAsset('')).toBeUndefined();
  });
});

describe('resolvePriceLookupAssetId', () => {
  it('resolves a staking vault asset ID to its native asset ID', () => {
    expect(
      resolvePriceLookupAssetId(
        `eip155:1/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:1']}`,
      ),
    ).toBe('eip155:1/slip44:60');
  });

  it('returns the input unchanged for a non-staking asset', () => {
    const assetId = 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    expect(resolvePriceLookupAssetId(assetId)).toBe(assetId);
  });

  it('returns the input unchanged for the native asset itself', () => {
    expect(resolvePriceLookupAssetId('eip155:1/slip44:60')).toBe(
      'eip155:1/slip44:60',
    );
  });
});
