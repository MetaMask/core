import { TokenNameProvider } from './token';
import { NameType } from '../types';

const VALUE_MOCK = 'TestValue';
const CHAIN_ID_MOCK = '0x1';
const PROVIDER_ID = 'token';
const TOKEN_NAME_MOCK = 'TestTokenName';

describe('TokenNameProvider', () => {
  describe('getMetadata', () => {
    it('returns the provider metadata', () => {
      const metadata = new TokenNameProvider().getMetadata();
      const { providerIds, providerLabels } = metadata;

      expect(Object.keys(providerIds)).toStrictEqual([
        NameType.ETHEREUM_ADDRESS,
      ]);

      expect(Object.values(providerIds)).toStrictEqual([[expect.any(String)]]);

      const providerId = Object.values(providerIds)[0][0];

      expect(Object.keys(providerLabels)).toStrictEqual([providerId]);
      expect(providerLabels[providerId]).toStrictEqual(expect.any(String));
    });
  });

  describe('getProposedNames', () => {
    it('returns the token name from infura response', async () => {
      const provider = new TokenNameProvider();
      const mockFetch = jest.spyOn(global, 'fetch');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: TOKEN_NAME_MOCK }),
      } as any);

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        chainId: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: {
          [PROVIDER_ID]: { proposedNames: [TOKEN_NAME_MOCK] },
        },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://token-api.metaswap.codefi.network/token/${CHAIN_ID_MOCK}?address=${VALUE_MOCK}`,
      );
    });

    it('throws if request fails', async () => {
      const provider = new TokenNameProvider();
      const mockFetch = jest.spyOn(global, 'fetch');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any);

      await expect(
        provider.getProposedNames({
          value: VALUE_MOCK,
          chainId: CHAIN_ID_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        }),
      ).rejects.toThrow(
        `Fetch failed with status '500' for request 'https://token-api.metaswap.codefi.network/token/${CHAIN_ID_MOCK}?address=${VALUE_MOCK}`,
      );
    });
  });
});
