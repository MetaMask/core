import { ENSNameProvider } from './ens';
import { NameType } from '../types';

jest.mock('../util');

const VALUE_MOCK = 'TestValue';
const CHAIN_ID_MOCK = '0x1';
const PROVIDER_ID = 'ens';
const DOMAIN_MOCK = 'testdomain.eth';
const REVERSE_LOOKUP_MOCK = () => DOMAIN_MOCK;

const CONSTRUCTOR_ARGS_MOCK = {
  reverseLookup: REVERSE_LOOKUP_MOCK,
} as any;

describe('ENSNameProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getMetadata', () => {
    it('returns the provider metadata', () => {
      const metadata = new ENSNameProvider(CONSTRUCTOR_ARGS_MOCK).getMetadata();
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
    it('returns the value from the reverse lookup callback', async () => {
      const provider = new ENSNameProvider(CONSTRUCTOR_ARGS_MOCK);

      const response = await provider.getProposedNames({
        value: VALUE_MOCK,
        chainId: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(response).toStrictEqual({
        results: {
          [PROVIDER_ID]: { proposedNames: [DOMAIN_MOCK] },
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
        chainId: CHAIN_ID_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(reverseLookupMock).toHaveBeenCalledTimes(1);
      expect(reverseLookupMock).toHaveBeenCalledWith(VALUE_MOCK, CHAIN_ID_MOCK);
    });
  });
});
