import { parseCaipAssetType } from './utils';

describe('MultichainAssetsController utils', () => {
  it('returns the chainId from a caip asset type', () => {
    const asset = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
    const chainId = parseCaipAssetType(asset);

    expect(chainId).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
  });
});
