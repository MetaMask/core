import type { NetworkClientId, Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionControllerMessenger } from '../TransactionController';
import { getProvider, rpcRequest } from './provider';

describe('provider utils', () => {
  const requestMock = jest.fn();
  const mockProvider = {
    request: requestMock,
  } as unknown as Provider;

  let messengerCallMock: jest.Mock;
  let messengerMock: TransactionControllerMessenger;

  beforeEach(() => {
    requestMock.mockReset();

    messengerCallMock = jest
      .fn()
      .mockImplementation((action: string, ...args: unknown[]) => {
        if (action === 'NetworkController:getNetworkClientById') {
          return { provider: mockProvider };
        }

        if (action === 'NetworkController:findNetworkClientIdByChainId') {
          return 'resolvedNetworkClientId';
        }

        throw new Error(
          `Unknown action: ${action}; args: ${JSON.stringify(args)}`,
        );
      });

    messengerMock = {
      call: messengerCallMock,
    } as unknown as TransactionControllerMessenger;
  });

  describe('rpcRequest', () => {
    it('uses networkClientId directly and calls provider.request', async () => {
      requestMock.mockResolvedValue('result');

      const networkClientId = 'networkClientIdA' as NetworkClientId;
      const params = ['0x123', 'latest'];

      const result = await rpcRequest({
        messenger: messengerMock,
        networkClientId,
        method: 'eth_getBalance',
        params,
      });

      expect(result).toBe('result');
      expect(messengerCallMock).toHaveBeenCalledTimes(1);
      expect(messengerCallMock).toHaveBeenCalledWith(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMock).toHaveBeenCalledWith({
        method: 'eth_getBalance',
        params,
      });
    });

    it('resolves chainId to networkClientId before calling provider.request', async () => {
      requestMock.mockResolvedValue('0x1');

      const chainId = '0x1' as Hex;

      const result = await rpcRequest({
        messenger: messengerMock,
        chainId,
        method: 'eth_chainId',
        params: [],
      });

      expect(result).toBe('0x1');
      expect(messengerCallMock).toHaveBeenCalledTimes(2);
      expect(messengerCallMock).toHaveBeenNthCalledWith(
        1,
        'NetworkController:findNetworkClientIdByChainId',
        chainId,
      );
      expect(messengerCallMock).toHaveBeenNthCalledWith(
        2,
        'NetworkController:getNetworkClientById',
        'resolvedNetworkClientId',
      );
      expect(requestMock).toHaveBeenCalledWith({
        method: 'eth_chainId',
        params: [],
      });
    });

    it('propagates provider.request errors', async () => {
      const error = new Error('RPC failed');
      requestMock.mockRejectedValue(error);

      await expect(
        rpcRequest({
          messenger: messengerMock,
          networkClientId: 'networkClientIdA' as NetworkClientId,
          method: 'eth_getBalance',
          params: ['0x123', 'latest'],
        }),
      ).rejects.toBe(error);
    });

    it('works when params are undefined', async () => {
      requestMock.mockResolvedValue('0x10');

      const result = await rpcRequest({
        messenger: messengerMock,
        networkClientId: 'networkClientIdA' as NetworkClientId,
        method: 'eth_blockNumber',
      });

      expect(result).toBe('0x10');
      expect(requestMock).toHaveBeenCalledWith({
        method: 'eth_blockNumber',
        params: undefined,
      });
    });
  });

  describe('getProvider', () => {
    it('returns provider using networkClientId directly', () => {
      const networkClientId = 'networkClientIdA' as NetworkClientId;

      const provider = getProvider({
        messenger: messengerMock,
        networkClientId,
      });

      expect(provider).toBe(mockProvider);
      expect(messengerCallMock).toHaveBeenCalledTimes(1);
      expect(messengerCallMock).toHaveBeenCalledWith(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
    });

    it('resolves chainId to networkClientId before returning provider', () => {
      const chainId = '0x89' as Hex;

      const provider = getProvider({ messenger: messengerMock, chainId });

      expect(provider).toBe(mockProvider);
      expect(messengerCallMock).toHaveBeenCalledTimes(2);
      expect(messengerCallMock).toHaveBeenNthCalledWith(
        1,
        'NetworkController:findNetworkClientIdByChainId',
        chainId,
      );
      expect(messengerCallMock).toHaveBeenNthCalledWith(
        2,
        'NetworkController:getNetworkClientById',
        'resolvedNetworkClientId',
      );
    });

    it('throws when neither chainId nor networkClientId is provided', () => {
      expect(() => getProvider({ messenger: messengerMock })).toThrow(
        'Either chainId or networkClientId must be provided',
      );
    });
  });
});
