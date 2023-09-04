import { LensNameProvider } from './lens';
import { NameType } from '../types';
import { graphQL } from '../util';

jest.mock('../util');

const VALUE_MOCK = 'TestValue';
const CHAIN_ID_MOCK = '0x1';
const SOURCE_ID = 'lens';
const HANDLE_MOCK = 'TestHandle';
const HANDLE_2_MOCK = 'TestHandle2';

describe('LensNameProvider', () => {
  const graphqlMock = jest.mocked(graphQL);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getMetadata', () => {
    it('returns the provider metadata', () => {
      const metadata = new LensNameProvider().getMetadata();
      const { sourceIds, sourceLabels } = metadata;

      expect(Object.keys(sourceIds)).toStrictEqual([NameType.ETHEREUM_ADDRESS]);
      expect(Object.values(sourceIds)).toStrictEqual([[expect.any(String)]]);

      const providerId = Object.values(sourceIds)[0][0];

      expect(Object.keys(sourceLabels)).toStrictEqual([providerId]);
      expect(sourceLabels[providerId]).toStrictEqual(expect.any(String));
    });
  });

  describe('getProposedNames', () => {
    it('returns the handles from lens response', async () => {
      const provider = new LensNameProvider();

      graphqlMock.mockResolvedValueOnce({
        profiles: {
          items: [
            {
              handle: HANDLE_MOCK,
            },
            {
              handle: HANDLE_2_MOCK,
            },
          ],
        },
      });

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        chainId: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: {
          [SOURCE_ID]: {
            proposedNames: [HANDLE_MOCK, HANDLE_2_MOCK],
          },
        },
      });
    });

    it.each([
      ['response is undefined', undefined],
      ['profiles is undefined', {}],
    ])('returns empty array if %s', async (_, lensResponse) => {
      const provider = new LensNameProvider();

      graphqlMock.mockResolvedValueOnce(lensResponse);

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        chainId: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: {
          [SOURCE_ID]: {
            proposedNames: [],
          },
        },
      });
    });
  });
});
