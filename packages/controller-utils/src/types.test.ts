import { isNetworkType, NetworkType } from './types';

describe('types', () => {
  it('isNetworkType', () => {
    // @ts-expect-error We are intentionally passing bad input.
    expect(isNetworkType({})).toBe(false);
    // @ts-expect-error We are intentionally passing bad input.
    expect(isNetworkType(1)).toBe(false);
    expect(isNetworkType('test')).toBe(false);
    expect(isNetworkType('mainnet')).toBe(true);
    expect(isNetworkType(NetworkType.mainnet)).toBe(true);
    expect(isNetworkType(NetworkType.goerli)).toBe(true);
    expect(isNetworkType(NetworkType.sepolia)).toBe(true);
    expect(isNetworkType(NetworkType['linea-goerli'])).toBe(true);
    expect(isNetworkType(NetworkType['linea-sepolia'])).toBe(true);
    expect(isNetworkType(NetworkType['linea-mainnet'])).toBe(true);
    expect(isNetworkType(NetworkType.rpc)).toBe(true);
  });
});
