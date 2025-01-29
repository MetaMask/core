import { MethodDataHelper } from './MethodDataHelper';
import type { MethodData } from '../TransactionController';

const FOUR_BYTE_PREFIX_MOCK = '0x12345678';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';

describe('MethodDataHelper', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('lookup', () => {
    it('returns method data from cache', async () => {
      const cachedMethodData: MethodData = {
        registryMethod: 'cached()',
        parsedRegistryMethod: {
          name: 'cached',
          args: [],
        },
      };

      const methodDataHelper = new MethodDataHelper({
        getState: () => ({ [FOUR_BYTE_PREFIX_MOCK]: cachedMethodData }),
      });

      const result = await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(result).toStrictEqual(cachedMethodData);
    });

    it('correctly parses a known method signature', async () => {
      const methodDataHelper = new MethodDataHelper({
        getState: () => ({}),
      });

      const fourBytePrefix = '0x13af4035';

      const result = await methodDataHelper.lookup(
        fourBytePrefix,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(result).toStrictEqual({
        registryMethod: 'setOwner(address)',
        parsedRegistryMethod: {
          name: 'setOwner',
          args: [{ type: 'address' }],
        },
      });
    });

    it('returns empty result for unknown method signature', async () => {
      const methodDataHelper = new MethodDataHelper({
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

    it('creates interface instance for each unique network client ID', async () => {
      const mockInterface = jest.fn().mockImplementation(() => ({
        getFunction: jest.fn().mockImplementation(() => {
          throw new Error('Function not found');
        }),
      }));

      jest.doMock('@ethersproject/abi', () => ({
        Interface: mockInterface,
      }));

      // Clear the module cache
      jest.resetModules();

      // Re-import dependencies after mocking
      // eslint-disable-next-line @typescript-eslint/no-require-imports, n/global-require, @typescript-eslint/no-shadow
      const { MethodDataHelper } = require('./MethodDataHelper');

      const methodDataHelper = new MethodDataHelper({
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

      await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        'anotherNetworkClientId',
      );

      expect(mockInterface).toHaveBeenCalledTimes(2);

      jest.unmock('@ethersproject/abi');
    });

    it('emits an update event for new lookups', async () => {
      const methodDataHelper = new MethodDataHelper({
        getState: () => ({}),
      });

      const updateListener = jest.fn();
      methodDataHelper.hub.on('update', updateListener);

      const fourBytePrefix = '0x13af4035';
      await methodDataHelper.lookup(fourBytePrefix, NETWORK_CLIENT_ID_MOCK);

      expect(updateListener).toHaveBeenCalledWith({
        fourBytePrefix,
        methodData: {
          registryMethod: 'setOwner(address)',
          parsedRegistryMethod: {
            name: 'setOwner',
            args: [{ type: 'address' }],
          },
        },
      });
    });
  });
});
