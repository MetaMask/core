import { MethodRegistry } from 'eth-method-registry';

import type { MethodData } from '../TransactionController';
import { MethodDataHelper } from './MethodDataHelper';

jest.mock('eth-method-registry');

const FOUR_BYTE_PREFIX_MOCK = '0x12345678';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const SIGNATURE_MOCK = 'testMethod(uint256,uint256)';

const METHOD_DATA_MOCK: MethodData = {
  registryMethod: SIGNATURE_MOCK,
  parsedRegistryMethod: {
    name: 'testMethod',
    args: [{ type: 'uint256' }, { type: 'uint256' }],
  },
};

/**
 * Creates a mock MethodRegistry instance.
 * @returns The mocked MethodRegistry instance.
 */
function createMethodRegistryMock() {
  return {
    lookup: jest.fn(),
    parse: jest.fn(),
  } as unknown as jest.Mocked<MethodRegistry>;
}

describe('MethodDataHelper', () => {
  const methodRegistryClassMock = jest.mocked(MethodRegistry);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('lookup', () => {
    it('returns method data from cache', async () => {
      const methodDataHelper = new MethodDataHelper({
        getProvider: jest.fn(),
        getState: () => ({ [FOUR_BYTE_PREFIX_MOCK]: METHOD_DATA_MOCK }),
      });

      const result = await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(result).toStrictEqual(METHOD_DATA_MOCK);
    });

    it('returns method data from registry lookup', async () => {
      const methodRegistryMock = createMethodRegistryMock();
      methodRegistryMock.lookup.mockResolvedValueOnce(SIGNATURE_MOCK);
      methodRegistryMock.parse.mockReturnValueOnce(
        METHOD_DATA_MOCK.parsedRegistryMethod,
      );

      methodRegistryClassMock.mockReturnValueOnce(methodRegistryMock);

      const methodDataHelper = new MethodDataHelper({
        getProvider: jest.fn(),
        getState: () => ({}),
      });

      const result = await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(result).toStrictEqual(METHOD_DATA_MOCK);
    });

    it('returns empty method data if not found in registry', async () => {
      const methodRegistryMock = createMethodRegistryMock();
      methodRegistryMock.lookup.mockResolvedValueOnce(undefined);

      methodRegistryClassMock.mockReturnValueOnce(methodRegistryMock);

      const methodDataHelper = new MethodDataHelper({
        getProvider: jest.fn(),
        getState: () => ({}),
      });

      const result = await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(result).toStrictEqual({
        registryMethod: '',
        parsedRegistryMethod: { name: undefined, args: undefined },
      });
    });

    it('creates registry instance for each unique network client ID', async () => {
      const getProviderMock = jest.fn();

      const methodRegistryMock = createMethodRegistryMock();
      methodRegistryMock.lookup.mockResolvedValueOnce(undefined);

      methodRegistryClassMock.mockReturnValueOnce(methodRegistryMock);

      const methodDataHelper = new MethodDataHelper({
        getProvider: getProviderMock,
        getState: () => ({}),
      });

      await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        'anotherNetworkClientId',
      );

      expect(methodRegistryClassMock).toHaveBeenCalledTimes(2);
      expect(getProviderMock).toHaveBeenCalledTimes(2);
    });

    it('emits event when method data is fetched', async () => {
      const methodRegistryMock = createMethodRegistryMock();
      methodRegistryMock.lookup.mockResolvedValueOnce(SIGNATURE_MOCK);
      methodRegistryMock.parse.mockReturnValueOnce(
        METHOD_DATA_MOCK.parsedRegistryMethod,
      );

      methodRegistryClassMock.mockReturnValueOnce(methodRegistryMock);

      const methodDataHelper = new MethodDataHelper({
        getProvider: jest.fn(),
        getState: () => ({}),
      });

      const updateListener = jest.fn();
      methodDataHelper.hub.on('update', updateListener);

      await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(updateListener).toHaveBeenCalledTimes(1);
      expect(updateListener).toHaveBeenCalledWith({
        fourBytePrefix: FOUR_BYTE_PREFIX_MOCK,
        methodData: METHOD_DATA_MOCK,
      });
    });
  });
});
