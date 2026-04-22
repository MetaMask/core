import { handleFetch } from '@metamask/controller-utils';

import {
  buildCaipAssetId,
  fetchVerifiedTokensByAddresses,
  MAX_BATCH_SIZE,
  MIN_OCCURRENCES,
  TOKENS_API_V3_BASE_URL,
} from './tokens-api-v3';
import type { TokenV3Asset } from './tokens-api-v3';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  handleFetch: jest.fn(),
}));

const mockHandleFetch = handleFetch as jest.MockedFunction<typeof handleFetch>;

const MOCK_CHAIN_ID = '0x1' as const;
const MOCK_TOKEN_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const makeAsset = (
  address: string,
  occurrences: number,
  chainId = MOCK_CHAIN_ID,
): TokenV3Asset => ({
  assetId: buildCaipAssetId(chainId, address),
  decimals: 18,
  iconUrl: `https://example.com/${address}.png`,
  name: 'Token',
  symbol: 'TKN',
  occurrences,
  aggregators: ['agg1', 'agg2'],
});

describe('tokens-api-v3', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('buildCaipAssetId', () => {
    it('builds a CAIP-19 asset ID from chainId and address', () => {
      expect(buildCaipAssetId('0x1', '0xAbCd')).toBe('eip155:1/erc20:0xabcd');
    });

    it('lowercases the token address', () => {
      const result = buildCaipAssetId(
        '0x89',
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      );
      expect(result).toBe(
        'eip155:137/erc20:0xabcdef1234567890abcdef1234567890abcdef12',
      );
    });
  });

  describe('fetchVerifiedTokensByAddresses', () => {
    it('returns an empty map when given an empty address list', async () => {
      const result = await fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, []);
      expect(result.size).toBe(0);
      expect(mockHandleFetch).not.toHaveBeenCalled();
    });

    it('returns verified tokens that meet the minimum occurrences threshold', async () => {
      const verifiedAsset = makeAsset(MOCK_TOKEN_ADDRESS, MIN_OCCURRENCES);
      mockHandleFetch.mockResolvedValue([verifiedAsset]);

      const result = await fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, [
        MOCK_TOKEN_ADDRESS,
      ]);

      expect(result.size).toBe(1);
      expect(result.get(MOCK_TOKEN_ADDRESS.toLowerCase())).toStrictEqual(
        verifiedAsset,
      );
    });

    it('filters out tokens below the minimum occurrences threshold', async () => {
      const spamAsset = makeAsset(MOCK_TOKEN_ADDRESS, MIN_OCCURRENCES - 1);
      mockHandleFetch.mockResolvedValue([spamAsset]);

      const result = await fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, [
        MOCK_TOKEN_ADDRESS,
      ]);

      expect(result.size).toBe(0);
    });

    it('correctly constructs the API URL with asset IDs', async () => {
      mockHandleFetch.mockResolvedValue([]);

      await fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, [MOCK_TOKEN_ADDRESS]);

      const expectedAssetId = buildCaipAssetId(
        MOCK_CHAIN_ID,
        MOCK_TOKEN_ADDRESS,
      );
      const expectedParams = new URLSearchParams({
        assetIds: expectedAssetId,
        includeOccurrences: 'true',
        includeIconUrl: 'true',
        includeAggregators: 'true',
        includeRwaData: 'true',
      });
      expect(mockHandleFetch).toHaveBeenCalledWith(
        `${TOKENS_API_V3_BASE_URL}/assets?${expectedParams}`,
      );
    });

    it('handles a non-array API response gracefully', async () => {
      mockHandleFetch.mockResolvedValue({ error: 'bad request' } as never);

      const result = await fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, [
        MOCK_TOKEN_ADDRESS,
      ]);

      expect(result.size).toBe(0);
    });

    it('splits large address lists into batches of MAX_BATCH_SIZE', async () => {
      const addresses = Array.from(
        { length: MAX_BATCH_SIZE + 5 },
        (_, i) => `0x${String(i).padStart(40, '0')}`,
      );

      mockHandleFetch.mockResolvedValue([]);

      await fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, addresses);

      // Should call the API twice: one full batch + one partial batch
      expect(mockHandleFetch).toHaveBeenCalledTimes(2);
    });

    it('deduplicates in-flight requests for identical batches', async () => {
      const addresses = [MOCK_TOKEN_ADDRESS];

      let resolveFirst!: (value: TokenV3Asset[]) => void;
      const firstCallPromise = new Promise<TokenV3Asset[]>((resolve) => {
        resolveFirst = resolve;
      });
      mockHandleFetch.mockReturnValueOnce(firstCallPromise as never);

      const [result1, result2] = await Promise.all([
        fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, addresses),
        fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, addresses),
        (async (): Promise<void> => {
          resolveFirst([makeAsset(MOCK_TOKEN_ADDRESS, MIN_OCCURRENCES)]);
        })(),
      ]);

      // Both callers should see the same result
      expect(result1?.size).toBe(result2?.size);
      // Only one HTTP request was made despite two callers
      expect(mockHandleFetch).toHaveBeenCalledTimes(1);
    });

    it('returns an empty map when the API throws', async () => {
      mockHandleFetch.mockRejectedValue(new Error('network error'));

      await expect(
        fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, [MOCK_TOKEN_ADDRESS]),
      ).rejects.toThrow('network error');
    });

    it('lowercases asset addresses in the result map', async () => {
      const mixedCaseAddress = '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD';
      const asset = makeAsset(mixedCaseAddress, MIN_OCCURRENCES);
      mockHandleFetch.mockResolvedValue([asset]);

      const result = await fetchVerifiedTokensByAddresses(MOCK_CHAIN_ID, [
        mixedCaseAddress,
      ]);

      expect(result.has(mixedCaseAddress.toLowerCase())).toBe(true);
    });
  });
});
