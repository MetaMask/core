import type { NetworkClient, Provider } from '@metamask/network-controller';
import { NetworkClientType } from '@metamask/network-controller';
import { RpcEndpointType } from '@metamask/network-controller';
import type { NetworkConfiguration } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import { getMessengerMock } from '../tests/messenger-mock.js';
import { getNetworkClientId, rpcRequest } from './provider.js';

const CHAIN_ID_MOCK = '0x1' as Hex;
const DEFAULT_NETWORK_CLIENT_ID_MOCK = 'default-client-id';
const INFURA_NETWORK_CLIENT_ID_MOCK = 'mainnet';
const PROVIDER_MOCK = { request: jest.fn() } as unknown as Provider;

function buildNetworkClient(
  provider: Provider,
  networkClientId = DEFAULT_NETWORK_CLIENT_ID_MOCK,
): Pick<NetworkClient, 'configuration' | 'provider'> {
  return {
    configuration: {
      chainId: CHAIN_ID_MOCK,
      type:
        networkClientId === INFURA_NETWORK_CLIENT_ID_MOCK
          ? NetworkClientType.Infura
          : NetworkClientType.Custom,
      rpcEndpoints: [
        {
          networkClientId,
          type:
            networkClientId === INFURA_NETWORK_CLIENT_ID_MOCK
              ? RpcEndpointType.Infura
              : RpcEndpointType.Custom,
        },
      ],
    },
    provider,
  };
}

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

    getNetworkClientByIdMock.mockImplementation((networkClientId) =>
      buildNetworkClient(PROVIDER_MOCK, networkClientId),
    );

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
        configuration: {
          chainId: CHAIN_ID_MOCK,
          type: NetworkClientType.Custom,
          rpcEndpoints: [
            {
              networkClientId: DEFAULT_NETWORK_CLIENT_ID_MOCK,
              type: RpcEndpointType.Custom,
            },
          ],
        },
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
        configuration: {
          chainId: CHAIN_ID_MOCK,
          type: NetworkClientType.Custom,
          rpcEndpoints: [
            {
              networkClientId: DEFAULT_NETWORK_CLIENT_ID_MOCK,
              type: RpcEndpointType.Custom,
            },
          ],
        },
        provider: { request: requestMock },
      } as never);

      await rpcRequest({
        messenger,
        chainId: CHAIN_ID_MOCK,
        method: 'eth_blockNumber',
      });

      expect(requestMock).toHaveBeenCalledWith({
        method: 'eth_blockNumber',
        params: undefined,
      });
    });

    it('prefixes provider errors with custom endpoint context', async () => {
      const error = new Error('RPC failed');
      const requestMock = jest.fn().mockRejectedValue(error);
      getNetworkClientByIdMock.mockReturnValue({
        configuration: {
          chainId: CHAIN_ID_MOCK,
          type: NetworkClientType.Custom,
          rpcEndpoints: [
            {
              networkClientId: DEFAULT_NETWORK_CLIENT_ID_MOCK,
              type: RpcEndpointType.Custom,
            },
          ],
        },
        provider: { request: requestMock },
      } as never);

      await expect(
        rpcRequest({
          messenger,
          chainId: CHAIN_ID_MOCK,
          method: 'eth_blockNumber',
        }),
      ).rejects.toBe(error);
      expect(error.message).toBe('RPC 0x1 Custom eth_blockNumber: RPC failed');
    });

    it('prefixes provider errors with Infura endpoint context', async () => {
      getNetworkConfigurationByChainIdMock.mockReturnValue({
        rpcEndpoints: [
          {
            type: RpcEndpointType.Infura,
            networkClientId: INFURA_NETWORK_CLIENT_ID_MOCK,
          },
        ],
      } as NetworkConfiguration);

      const error = new Error('Unauthorized.');
      const requestMock = jest.fn().mockRejectedValue(error);
      getNetworkClientByIdMock.mockReturnValue({
        configuration: {
          chainId: CHAIN_ID_MOCK,
          type: NetworkClientType.Infura,
          rpcEndpoints: [
            {
              networkClientId: INFURA_NETWORK_CLIENT_ID_MOCK,
              type: RpcEndpointType.Infura,
            },
          ],
        },
        provider: { request: requestMock },
      } as never);

      await expect(
        rpcRequest({
          messenger,
          chainId: CHAIN_ID_MOCK,
          method: 'eth_getBalance',
          options: { preferInfura: true },
        }),
      ).rejects.toBe(error);
      expect(error.message).toBe(
        'RPC 0x1 Infura eth_getBalance: Unauthorized.',
      );
    });

    it('uses nested RPC data messages when available', async () => {
      const error = Object.assign(new Error('Outer message'), {
        data: { message: 'Nested rpc error message' },
      });
      const requestMock = jest.fn().mockRejectedValue(error);
      getNetworkClientByIdMock.mockReturnValue({
        configuration: {
          chainId: CHAIN_ID_MOCK,
          type: NetworkClientType.Custom,
          rpcEndpoints: [
            {
              networkClientId: DEFAULT_NETWORK_CLIENT_ID_MOCK,
              type: RpcEndpointType.Custom,
            },
          ],
        },
        provider: { request: requestMock },
      } as never);

      await expect(
        rpcRequest({
          messenger,
          chainId: CHAIN_ID_MOCK,
          method: 'eth_blockNumber',
        }),
      ).rejects.toBe(error);
      expect(error.message).toBe(
        'RPC 0x1 Custom eth_blockNumber: Nested rpc error message',
      );
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
        configuration: {
          chainId: CHAIN_ID_MOCK,
          type: NetworkClientType.Infura,
          rpcEndpoints: [
            {
              networkClientId: INFURA_NETWORK_CLIENT_ID_MOCK,
              type: RpcEndpointType.Infura,
            },
          ],
        },
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
