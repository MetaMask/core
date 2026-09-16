import { getKnownTokenMetadata } from './token-metadata.js';

describe('getKnownTokenMetadata', () => {
  it('returns undefined when the contract address is missing', () => {
    expect(getKnownTokenMetadata('eip155:1')).toBeUndefined();
  });

  it('returns undefined for non-mainnet chains', () => {
    expect(
      getKnownTokenMetadata(
        'eip155:8453',
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      ),
    ).toBeUndefined();
  });

  it('returns undefined for unknown mainnet tokens', () => {
    expect(
      getKnownTokenMetadata(
        'eip155:1',
        '0x1111111111111111111111111111111111111111',
      ),
    ).toBeUndefined();
  });

  it('returns metadata for a known mainnet token', () => {
    expect(
      getKnownTokenMetadata(
        'eip155:1',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      ),
    ).toMatchObject({
      symbol: 'USDC',
      decimals: 6,
      assetId: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    });
  });
});
