import { NameType } from '../types';
import { handleFetch } from '../util';
import { TokenNameProvider } from './token';

jest.mock('../util');

const VALUE_MOCK = 'TestValue';
const CHAIN_ID_MOCK = '0x1';
const SOURCE_ID = 'token';
const TOKEN_NAME_MOCK = 'TestTokenName';

describe('TokenNameProvider', () => {
  const handleFetchMock = jest.mocked(handleFetch);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getMetadata', () => {
    it('returns the provider metadata', () => {
      const metadata = new TokenNameProvider().getMetadata();
      const { sourceIds, sourceLabels } = metadata;

      expect(Object.keys(sourceIds)).toStrictEqual([NameType.ETHEREUM_ADDRESS]);
      expect(Object.values(sourceIds)).toStrictEqual([[expect.any(String)]]);

      const providerId = Object.values(sourceIds)[0][0];

      expect(Object.keys(sourceLabels)).toStrictEqual([providerId]);
      expect(sourceLabels[providerId]).toStrictEqual(expect.any(String));
    });
  });

  describe('getProposedNames', () => {
    it('returns the token name from infura response', async () => {
      const provider = new TokenNameProvider();

      handleFetchMock.mockResolvedValueOnce({ name: TOKEN_NAME_MOCK });

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: {
          [SOURCE_ID]: { proposedNames: [TOKEN_NAME_MOCK] },
        },
      });

      expect(handleFetchMock).toHaveBeenCalledTimes(1);
      expect(handleFetchMock).toHaveBeenCalledWith(
        `https://token.api.cx.metamask.io/token/${CHAIN_ID_MOCK}?address=${VALUE_MOCK}`,
      );
    });

    it('returns empty array if no token name in infura response', async () => {
      const provider = new TokenNameProvider();

      handleFetchMock.mockResolvedValueOnce({ name: undefined });

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: {
          [SOURCE_ID]: { proposedNames: [] },
        },
      });
    });

    it('returns empty result if disabled', async () => {
      const provider = new TokenNameProvider({
        isEnabled: () => false,
      });

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: { [SOURCE_ID]: { proposedNames: [] } },
      });
    });

    it('throws if request fails', async () => {
      handleFetchMock.mockImplementation(() => {
        throw new Error('TestError');
      });

      const provider = new TokenNameProvider();

      await expect(
        provider.getProposedNames({
          value: VALUE_MOCK,
          variation: CHAIN_ID_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        }),
      ).rejects.toThrow('TestError');
    });
  });
});
