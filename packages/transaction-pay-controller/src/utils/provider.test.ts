import type { Provider } from '@metamask/network-controller';
import { RpcEndpointType } from '@metamask/network-controller';
import type { NetworkConfiguration } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import { getMessengerMock } from '../tests/messenger-mock';
import { getNetworkClientId, rpcRequest } from './provider';

const CHAIN_ID_MOCK = '0x1' as Hex;
const DEFAULT_NETWORK_CLIENT_ID_MOCK = 'default-client-id';
const INFURA_NETWORK_CLIENT_ID_MOCK = 'mainnet';
const PROVIDER_MOCK = { request: jest.fn() } as unknown as Provider;

describe('provider utils', () => {
  const {
    messenger,
    findNetworkClientIdByChainIdMock,
    getNetworkClientByIdMock,
    getNetworkConfigurationByChainIdMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    findNetworkClientIdByChainIdMock.mockReturnValue(
      DEFAULT_NETWORK_CLIENT_ID_MOCK,
    );

    getNetworkClientByIdMock.mockReturnValue({
      provider: PROVIDER_MOCK,
    } as never);

    getNetworkConfigurationByChainIdMock.mockReturnValue(undefined);
  });

  describe('getNetworkClientId', () => {
    it('returns default network client ID when preferInfura is false', () => {
      const result = getNetworkClientId(messenger, CHAIN_ID_MOCK);

      expect(result).toBe(DEFAULT_NETWORK_CLIENT_ID_MOCK);
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
      expect(getNetworkConfigurationByChainIdMock).not.toHaveBeenCalled();
    });

    it('returns Infura network client ID when preferInfura is true and Infura endpoint exists', () => {
      getNetworkConfigurationByChainIdMock.mockReturnValue({
        rpcEndpoints: [
          {
            type: RpcEndpointType.Infura,
            networkClientId: INFURA_NETWORK_CLIENT_ID_MOCK,
          },
        ],
      } as NetworkConfiguration);

      const result = getNetworkClientId(messenger, CHAIN_ID_MOCK, {
        preferInfura: true,
      });

      expect(result).toBe(INFURA_NETWORK_CLIENT_ID_MOCK);
      expect(findNetworkClientIdByChainIdMock).not.toHaveBeenCalled();
    });

    it('falls back to default network client ID when preferInfura is true but no Infura endpoint exists', () => {
      getNetworkConfigurationByChainIdMock.mockReturnValue({
        rpcEndpoints: [
          {
            type: RpcEndpointType.Custom,
            networkClientId: 'custom-rpc-id',
          },
        ],
      } as NetworkConfiguration);

      const result = getNetworkClientId(messenger, CHAIN_ID_MOCK, {
        preferInfura: true,
      });

      expect(result).toBe(DEFAULT_NETWORK_CLIENT_ID_MOCK);
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
    });

    it('falls back to default network client ID when preferInfura is true but getNetworkConfigurationByChainId throws', () => {
      getNetworkConfigurationByChainIdMock.mockImplementation(() => {
        throw new Error('Configuration not found');
      });

      const result = getNetworkClientId(messenger, CHAIN_ID_MOCK, {
        preferInfura: true,
      });

      expect(result).toBe(DEFAULT_NETWORK_CLIENT_ID_MOCK);
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
    });

    it('falls back to default network client ID when preferInfura is true but network configuration is undefined', () => {
      getNetworkConfigurationByChainIdMock.mockReturnValue(undefined);

      const result = getNetworkClientId(messenger, CHAIN_ID_MOCK, {
        preferInfura: true,
      });

      expect(result).toBe(DEFAULT_NETWORK_CLIENT_ID_MOCK);
      expect(findNetworkClientIdByChainIdMock).toHaveBeenCalledWith(
        CHAIN_ID_MOCK,
      );
    });
  });

  describe('rpcRequest', () => {
    it('calls provider.request with method and params', async () => {
      const requestMock = jest.fn().mockResolvedValue('0xabc');
      getNetworkClientByIdMock.mockReturnValue({
        provider: { request: requestMock },
      } as never);

      const result = await rpcRequest({
        messenger,
        chainId: CHAIN_ID_MOCK,
        method: 'eth_chainId',
        params: ['latest'],
      });

      expect(result).toBe('0xabc');
      expect(requestMock).toHaveBeenCalledWith({
        method: 'eth_chainId',
        params: ['latest'],
      });
    });

    it('calls provider.request without params when omitted', async () => {
      const requestMock = jest.fn().mockResolvedValue('0x10');
      getNetworkClientByIdMock.mockReturnValue({
        provider: { request: requestMock },
      } as never);

      await rpcRequest({ messenger, chainId: CHAIN_ID_MOCK, method: 'eth_blockNumber' });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'eth_blockNumber',
        params: undefined,
      });
    });

    it('propagates provider errors', async () => {
      const error = new Error('RPC failed');
      const requestMock = jest.fn().mockRejectedValue(error);
      getNetworkClientByIdMock.mockReturnValue({
        provider: { request: requestMock },
      } as never);

      await expect(
        rpcRequest({ messenger, chainId: CHAIN_ID_MOCK, method: 'eth_blockNumber' }),
      ).rejects.toBe(error);
    });

    it('uses Infura network client when preferInfura is true', async () => {
      getNetworkConfigurationByChainIdMock.mockReturnValue({
        rpcEndpoints: [
          {
            type: RpcEndpointType.Infura,
            networkClientId: INFURA_NETWORK_CLIENT_ID_MOCK,
          },
        ],
      } as NetworkConfiguration);

      const requestMock = jest.fn().mockResolvedValue('0x1');
      getNetworkClientByIdMock.mockReturnValue({
        provider: { request: requestMock },
      } as never);

      await rpcRequest({
        messenger,
        chainId: CHAIN_ID_MOCK,
        method: 'eth_chainId',
        params: [],
        options: { preferInfura: true },
      });

      expect(getNetworkClientByIdMock).toHaveBeenCalledWith(
        INFURA_NETWORK_CLIENT_ID_MOCK,
      );
    });
  });
});
