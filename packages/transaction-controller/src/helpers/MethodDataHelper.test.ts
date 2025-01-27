import { type FunctionFragment, Interface } from '@ethersproject/abi';

import { MethodDataHelper } from './MethodDataHelper';
import type { MethodData } from '../TransactionController';

jest.mock('@ethersproject/abi');

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
 * Creates a mock Interface instance.
 *
 * @returns The mocked Interface instance.
 */
function createInterfaceMock() {
  return {
    getFunction: jest.fn(),
  } as unknown as jest.Mocked<Interface>;
}

describe('MethodDataHelper', () => {
  const interfaceClassMock = jest.mocked(Interface);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('lookup', () => {
    it('returns method data from cache', async () => {
      const methodDataHelper = new MethodDataHelper({
        getState: () => ({ [FOUR_BYTE_PREFIX_MOCK]: METHOD_DATA_MOCK }),
      });

      const result = await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(result).toStrictEqual(METHOD_DATA_MOCK);
    });

    it('returns method data from interface lookup', async () => {
      const interfaceMock = createInterfaceMock();
      interfaceMock.getFunction.mockReturnValueOnce({
        name: 'testMethod',
        inputs: [{ type: 'uint256' }, { type: 'uint256' }],
        format: jest.fn(() => SIGNATURE_MOCK),
      } as unknown as FunctionFragment);

      interfaceClassMock.mockReturnValueOnce(interfaceMock);

      const methodDataHelper = new MethodDataHelper({
        getState: () => ({}),
      });

      const result = await methodDataHelper.lookup(
        FOUR_BYTE_PREFIX_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(result).toStrictEqual(METHOD_DATA_MOCK);
    });

    it('returns empty method data if not found in interface', async () => {
      const interfaceMock = createInterfaceMock();
      interfaceMock.getFunction.mockImplementationOnce(() => {
        throw new Error('Function not found');
      });

      interfaceClassMock.mockReturnValueOnce(interfaceMock);

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
      const interfaceMock = createInterfaceMock();
      interfaceMock.getFunction.mockImplementationOnce(() => {
        throw new Error('Function not found');
      });

      interfaceClassMock.mockReturnValueOnce(interfaceMock);

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

      expect(interfaceClassMock).toHaveBeenCalledTimes(2);
    });

    it('emits event when method data is fetched', async () => {
      const interfaceMock = createInterfaceMock();
      interfaceMock.getFunction.mockReturnValueOnce({
        name: 'testMethod',
        inputs: [{ type: 'uint256' }, { type: 'uint256' }],
        format: jest.fn(() => SIGNATURE_MOCK),
      } as unknown as FunctionFragment);

      interfaceClassMock.mockReturnValueOnce(interfaceMock);

      const methodDataHelper = new MethodDataHelper({
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
