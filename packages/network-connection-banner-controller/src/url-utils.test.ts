import { getIsInfuraEndpoint } from './url-utils';

const INFURA_PROJECT_ID = 'abc123def456';

describe('getIsInfuraEndpoint', () => {
  it.each([
    // Built-in configurations keep the placeholder.
    'https://mainnet.infura.io/v3/{infuraProjectId}',
    'https://sepolia.infura.io/v3/{infuraProjectId}',
    'https://polygon-mainnet.infura.io/v3/{infuraProjectId}',
    // Some flows (e.g. adding a popular network) persist the URL with the
    // wallet's own project id already substituted.
    `https://avalanche-mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
  ])('returns true for the MetaMask Infura endpoint %s', (url) => {
    expect(getIsInfuraEndpoint(url, INFURA_PROJECT_ID)).toBe(true);
  });

  it.each([
    // Custom providers.
    'https://polygon-rpc.com',
    'https://eth-mainnet.alchemyapi.io/v2/abc',
    // A different project id means the endpoint runs on the user's own
    // Infura account, which behaves like any custom RPC.
    'https://mainnet.infura.io/v3/someone-elses-project-id',
    // Wrong scheme, path, or host shape.
    'http://mainnet.infura.io/v3/{infuraProjectId}',
    `http://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
    'https://mainnet.infura.io/v2/{infuraProjectId}',
    'https://mainnet.evil.io/v3/{infuraProjectId}',
    'https://sub.mainnet.infura.io/v3/{infuraProjectId}',
    'not a url',
  ])('returns false for %s', (url) => {
    expect(getIsInfuraEndpoint(url, INFURA_PROJECT_ID)).toBe(false);
  });

  it('escapes regex metacharacters in the project id', () => {
    expect(getIsInfuraEndpoint('https://mainnet.infura.io/v3/a+b', 'a+b')).toBe(
      true,
    );
    expect(getIsInfuraEndpoint('https://mainnet.infura.io/v3/aab', 'a+b')).toBe(
      false,
    );
  });
});
