import { ControllerMessenger } from '@metamask/base-controller';
import type {
  NetworkState,
  NetworkControllerActions,
  NetworkConfiguration,
} from '@metamask/network-controller';
import {
  NetworkController,
  NetworkStatus,
  RpcEndpointType,
} from '@metamask/network-controller';
import nock from 'nock';

import type { UserStorageControllerMessenger } from '..';
import type { RPCEndpoint } from './__fixtures__/mockNetwork';
import {
  createMockCustomRpcEndpoint,
  createMockInfuraRpcEndpoint,
  createMockNetworkConfiguration,
} from './__fixtures__/mockNetwork';
import { dispatchUpdateNetwork } from './controller-integration';

const createNetworkControllerState = (
  rpcs: RPCEndpoint[] = [createMockInfuraRpcEndpoint()],
): NetworkState => {
  const mockNetworkConfig = createMockNetworkConfiguration({ chainId: '0x1' });
  mockNetworkConfig.rpcEndpoints = rpcs;

  const state: NetworkState = {
    selectedNetworkClientId: 'mainnet',
    networkConfigurationsByChainId: {
      '0x1': mockNetworkConfig,
    },
    networksMetadata: {},
  };

  rpcs.forEach((r) => {
    state.networksMetadata[r.networkClientId] = {
      EIPS: {
        '1559': true,
      },
      status: NetworkStatus.Available,
    };
  });

  return state;
};

const createNetworkConfigurationWithRpcs = (rpcs: RPCEndpoint[]) => {
  const config = createMockNetworkConfiguration({ chainId: '0x1' });
  config.rpcEndpoints = rpcs;
  return config;
};

describe('network-syncing/controller-integration - dispatchUpdateNetwork()', () => {
  beforeEach(() => {
    nock('https://mainnet.infura.io').post('/v3/TEST_ID').reply(200, {
      jsonrpc: '2.0',
      id: 1,
      result: {},
    });
  });

  afterAll(() => {
    nock.cleanAll();
  });

  const setupTest = ({
    initialRpcs,
    newRpcs,
    selectedNetworkClientId,
  }: {
    initialRpcs: RPCEndpoint[];
    newRpcs: RPCEndpoint[];
    selectedNetworkClientId?: string;
  }) => {
    const initialState = createNetworkControllerState(initialRpcs);
    if (selectedNetworkClientId) {
      initialState.selectedNetworkClientId = selectedNetworkClientId;
    }

    const newNetworkConfiguration = createNetworkConfigurationWithRpcs(newRpcs);

    return { initialState, newNetworkConfiguration };
  };

  const arrangeNetworkController = (networkState: NetworkState) => {
    const baseMessenger = new ControllerMessenger<
      NetworkControllerActions,
      never
    >();
    const networkControllerMessenger = baseMessenger.getRestricted({
      name: 'NetworkController',
      allowedActions: [],
      allowedEvents: [],
    });

    const networkController = new NetworkController({
      messenger: networkControllerMessenger,
      state: networkState,
      infuraProjectId: 'TEST_ID',
    });

    return { networkController, baseMessenger };
  };

  const act = async (
    props: Pick<
      ReturnType<typeof arrangeNetworkController>,
      'networkController' | 'baseMessenger'
    > & {
      newNetworkConfiguration: NetworkConfiguration;
    },
  ) => {
    const { baseMessenger, networkController, newNetworkConfiguration } = props;

    await dispatchUpdateNetwork({
      messenger: baseMessenger as unknown as UserStorageControllerMessenger,
      originalNetworkConfiguration:
        networkController.state.networkConfigurationsByChainId['0x1'],
      selectedNetworkClientId: networkController.state.selectedNetworkClientId,
      newNetworkConfiguration,
    });

    return {
      rpcEndpoints:
        networkController.state.networkConfigurationsByChainId['0x1']
          .rpcEndpoints,
      newSelectedNetworkClientId:
        networkController.state.selectedNetworkClientId,
    };
  };

  it('should append missing Infura networks', async () => {
    // Arrange
    const { initialState, newNetworkConfiguration } = setupTest({
      initialRpcs: [createMockInfuraRpcEndpoint()],
      newRpcs: [],
    });
    const arrange = arrangeNetworkController(initialState);

    // Act
    const result = await act({ ...arrange, newNetworkConfiguration });

    // Assert - we keep the infura endpoint and it is not overwritten
    expect(result.rpcEndpoints).toHaveLength(1);
    expect(result.rpcEndpoints[0].type).toBe(RpcEndpointType.Infura);
  });

  it('should add new remote RPCs (from a different device)', async () => {
    // Arrange
    const { initialState, newNetworkConfiguration } = setupTest({
      initialRpcs: [createMockInfuraRpcEndpoint()],
      newRpcs: [
        createMockInfuraRpcEndpoint(),
        createMockCustomRpcEndpoint({
          networkClientId: 'EXT_DEVICE_1',
          url: 'https://mock.network',
        }),
      ],
    });
    const arrange = arrangeNetworkController(initialState);

    // Act
    const result = await act({
      ...arrange,
      newNetworkConfiguration,
    });

    // Assert
    expect(result.rpcEndpoints).toHaveLength(2);
    expect(result.rpcEndpoints[1]).toStrictEqual(
      expect.objectContaining({
        networkClientId: expect.any(String), // this was added, so is a new random uuid
        url: 'https://mock.network',
      }),
    );
    expect(result.rpcEndpoints[1].networkClientId).not.toBe('EXT_DEVICE_1');
  });

  it('should overwrite (remove and add) rpcs from remote (a different device) and update selected network if necessary', async () => {
    // Arrange
    const { initialState, newNetworkConfiguration } = setupTest({
      initialRpcs: [
        createMockInfuraRpcEndpoint(),
        createMockCustomRpcEndpoint({
          networkClientId: 'DEVICE_1',
          url: 'https://mock.network',
        }),
      ],
      // Remote does not have https://mock.network, but does have https://mock.network/2
      newRpcs: [
        createMockInfuraRpcEndpoint(),
        createMockCustomRpcEndpoint({
          networkClientId: 'EXT_DEVICE_2',
          url: 'https://mock.network/2',
        }),
      ],
      // We have selected DEVICE_1
      selectedNetworkClientId: 'DEVICE_1',
    });
    const arrange = arrangeNetworkController(initialState);

    // Act
    const result = await act({
      ...arrange,
      newNetworkConfiguration,
    });

    // Assert
    expect(result.rpcEndpoints).toHaveLength(2);
    expect(result.rpcEndpoints[0].type).toBe(RpcEndpointType.Infura); // Infura RPC is kept
    expect(result.rpcEndpoints[1]).toStrictEqual(
      expect.objectContaining({
        // New RPC was added
        networkClientId: expect.any(String),
        url: 'https://mock.network/2',
      }),
    );
    expect(
      result.rpcEndpoints.some((r) => r.networkClientId === 'DEVICE_1'),
    ).toBe(false); // Old RPC was removed
    expect(result.newSelectedNetworkClientId).toBe('mainnet'); // We also change to the next available RPC to select
  });

  it('should keep the selected network if it is still present', async () => {
    // Arrange
    const { initialState, newNetworkConfiguration } = setupTest({
      initialRpcs: [
        createMockInfuraRpcEndpoint(),
        createMockCustomRpcEndpoint({
          networkClientId: 'DEVICE_1',
          url: 'https://mock.network',
        }),
      ],
      newRpcs: [
        createMockInfuraRpcEndpoint(),
        createMockCustomRpcEndpoint({
          networkClientId: 'DEVICE_1', // We keep DEVICE_1
          url: 'https://mock.network',
          name: 'Custom Name',
        }),
      ],
      selectedNetworkClientId: 'DEVICE_1',
    });
    const arrange = arrangeNetworkController(initialState);

    // Act
    const result = await act({
      ...arrange,
      newNetworkConfiguration,
    });

    // Assert
    expect(result.rpcEndpoints).toHaveLength(2);
    expect(result.rpcEndpoints[1]).toStrictEqual(
      expect.objectContaining({
        networkClientId: 'DEVICE_1',
        url: 'https://mock.network',
        name: 'Custom Name',
      }),
    );
    expect(result.newSelectedNetworkClientId).toBe('DEVICE_1'); // selected rpc has not changed
  });
});
