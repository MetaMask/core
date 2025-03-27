import { handleFetch } from '@metamask/controller-utils';

import { MULTICHAIN_ACCOUNTS_DOMAIN } from './constants';
import { fetchNetworkActivityByAccounts } from './multichain-active-networks';

jest.mock('@metamask/controller-utils', () => ({
  handleFetch: jest.fn(),
}));

describe('fetchNetworkActivityByAccounts', () => {
  const mockValidAccountId =
    'eip155:1:0x1234567890123456789012345678901234567890';
  const mockValidSolanaAccountId =
    'solana:1:0x1234567890123456789012345678901234567890';
  const mockInvalidAccountId = 'invalid:0:123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should successfully fetch active networks for valid EVM account ID', async () => {
    const mockResponse = {
      networksWithActivity: [
        'eip155:1:0x1234567890123456789012345678901234567890',
        'eip155:137:0x1234567890123456789012345678901234567890',
      ],
    };

    (handleFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const expectedUrl = new URL(
      `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks`,
    );
    expectedUrl.searchParams.append('accountIds', mockValidAccountId);

    const result = await fetchNetworkActivityByAccounts([mockValidAccountId]);

    const [calledUrl, calledOptions] = (handleFetch as jest.Mock).mock.calls[0];
    expect(new URL(calledUrl).toString()).toBe(expectedUrl.toString());
    expect(calledOptions.method).toBe('GET');
    expect(calledOptions.headers).toStrictEqual({ Accept: 'application/json' });
    expect(calledOptions.signal).toBeDefined();
    expect(result).toStrictEqual(mockResponse);
  });

  it('should successfully fetch active networks for valid Solana account ID', async () => {
    const mockResponse = {
      networksWithActivity: [
        'solana:1:0x1234567890123456789012345678901234567890',
      ],
    };

    (handleFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const result = await fetchNetworkActivityByAccounts([
      mockValidSolanaAccountId,
    ]);
    expect(result).toStrictEqual(mockResponse);
  });

  it('should handle multiple account IDs correctly', async () => {
    const mockResponse = {
      networksWithActivity: [
        'eip155:1:0x1234567890123456789012345678901234567890',
        'solana:1:0x1234567890123456789012345678901234567890',
      ],
    };

    (handleFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const expectedUrl = new URL(
      `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks`,
    );
    expectedUrl.searchParams.append(
      'accountIds',
      `${mockValidAccountId},${mockValidSolanaAccountId}`,
    );

    const result = await fetchNetworkActivityByAccounts([
      mockValidAccountId,
      mockValidSolanaAccountId,
    ]);

    const [calledUrl, calledOptions] = (handleFetch as jest.Mock).mock.calls[0];
    expect(new URL(calledUrl).toString()).toBe(expectedUrl.toString());
    expect(calledOptions.method).toBe('GET');
    expect(calledOptions.headers).toStrictEqual({ Accept: 'application/json' });
    expect(calledOptions.signal).toBeDefined();
    expect(result).toStrictEqual(mockResponse);
  });

  it('should throw error for empty account IDs array', async () => {
    await expect(fetchNetworkActivityByAccounts([])).rejects.toThrow(
      'At least one account ID is required',
    );
  });

  it('should throw error for invalid account ID format', async () => {
    await expect(
      fetchNetworkActivityByAccounts([mockInvalidAccountId]),
    ).rejects.toThrow(/Invalid CAIP-10 account IDs/u);
  });

  it('should throw error for invalid API response format', async () => {
    (handleFetch as jest.Mock).mockResolvedValueOnce({
      invalidKey: [],
    });

    await expect(
      fetchNetworkActivityByAccounts([mockValidAccountId]),
    ).rejects.toThrow('Invalid response format from active networks API');
  });

  it('should handle request timeout', async () => {
    (handleFetch as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error(), { name: 'AbortError' }),
    );

    await expect(
      fetchNetworkActivityByAccounts([mockValidAccountId]),
    ).rejects.toThrow('Request timeout: Failed to fetch active networks');
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network failure');
    (handleFetch as jest.Mock).mockRejectedValueOnce(networkError);

    await expect(
      fetchNetworkActivityByAccounts([mockValidAccountId]),
    ).rejects.toThrow(networkError);
  });

  it('should handle non-Error objects in catch block', async () => {
    (handleFetch as jest.Mock).mockRejectedValueOnce('String error');

    await expect(
      fetchNetworkActivityByAccounts([mockValidAccountId]),
    ).rejects.toThrow('Failed to fetch active networks: String error');
  });
});
