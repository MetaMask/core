import { getIsInfuraEndpoint } from './url-utils';

describe('getIsInfuraEndpoint', () => {
  it.each([
    'https://mainnet.infura.io/v3/{infuraProjectId}',
    'https://sepolia.infura.io/v3/{infuraProjectId}',
    'https://polygon-mainnet.infura.io/v3/{infuraProjectId}',
  ])('returns true for the stored Infura endpoint shape %s', (url) => {
    expect(getIsInfuraEndpoint(url)).toBe(true);
  });

  it.each([
    // Custom providers.
    'https://polygon-rpc.com',
    'https://eth-mainnet.alchemyapi.io/v2/abc',
    // A literal project id means the endpoint was added manually, not from
    // our built-in configurations, which keep the placeholder.
    'https://mainnet.infura.io/v3/1234567890abcdef',
    // Wrong scheme, path, or host shape.
    'http://mainnet.infura.io/v3/{infuraProjectId}',
    'https://mainnet.infura.io/v2/{infuraProjectId}',
    'https://mainnet.evil.io/v3/{infuraProjectId}',
    'https://sub.mainnet.infura.io/v3/{infuraProjectId}',
    'not a url',
  ])('returns false for %s', (url) => {
    expect(getIsInfuraEndpoint(url)).toBe(false);
  });
});
