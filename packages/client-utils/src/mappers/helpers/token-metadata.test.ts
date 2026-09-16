import { getKnownTokenMetadata } from './token-metadata.js';

describe('getKnownTokenMetadata', () => {
  it('returns undefined when the contract address is missing', () => {
    expect(getKnownTokenMetadata('eip155:1')).toBeUndefined();
  });

  it('returns metadata for a known token on a non-mainnet chain', () => {
    expect(
      getKnownTokenMetadata(
        'eip155:8453',
        '0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D',
      ),
    ).toMatchObject({
      symbol: 'wARS',
      decimals: 18,
      assetId:
        'eip155:8453/erc20:0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D',
    });
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
