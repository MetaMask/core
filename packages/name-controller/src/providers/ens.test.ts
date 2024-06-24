import { NameType } from '../types';
import { ENSNameProvider } from './ens';

jest.mock('../util');

const VALUE_MOCK = 'TestValue';
const CHAIN_ID_MOCK = '0x1';
const SOURCE_ID = 'ens';
const DOMAIN_MOCK = 'testdomain.eth';
const REVERSE_LOOKUP_MOCK = () => DOMAIN_MOCK;

const CONSTRUCTOR_ARGS_MOCK = {
  reverseLookup: REVERSE_LOOKUP_MOCK,
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('ENSNameProvider', () => {
  describe('getMetadata', () => {
    it('returns the provider metadata', () => {
      const metadata = new ENSNameProvider(CONSTRUCTOR_ARGS_MOCK).getMetadata();
      const { sourceIds, sourceLabels } = metadata;

      expect(Object.keys(sourceIds)).toStrictEqual([NameType.ETHEREUM_ADDRESS]);
      expect(Object.values(sourceIds)).toStrictEqual([[expect.any(String)]]);

      const providerId = Object.values(sourceIds)[0][0];

      expect(Object.keys(sourceLabels)).toStrictEqual([providerId]);
      expect(sourceLabels[providerId]).toStrictEqual(expect.any(String));
    });
  });

  describe('getProposedNames', () => {
    it('returns the value from the reverse lookup callback', async () => {
      const provider = new ENSNameProvider(CONSTRUCTOR_ARGS_MOCK);

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: {
          [SOURCE_ID]: { proposedNames: [DOMAIN_MOCK] },
        },
      });
    });

    it('invokes reverse lookup with value and chain ID', async () => {
      const reverseLookupMock = jest.fn();

      const provider = new ENSNameProvider({
        reverseLookup: reverseLookupMock,
      });

      await provider.getProposedNames({
        value: VALUE_MOCK,
        variation: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(reverseLookupMock).toHaveBeenCalledTimes(1);
      expect(reverseLookupMock).toHaveBeenCalledWith(VALUE_MOCK, CHAIN_ID_MOCK);
    });

    it('returns empty result if disabled', async () => {
      const provider = new ENSNameProvider({
        ...CONSTRUCTOR_ARGS_MOCK,
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

    it('throws if callback fails', async () => {
      const reverseLookupMock = jest.fn().mockImplementation(() => {
        throw new Error('TestError');
      });

      const provider = new ENSNameProvider({
        reverseLookup: reverseLookupMock,
      });

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
