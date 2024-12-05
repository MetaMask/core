import type { RPCEndpoint } from './__fixtures__/mockNetwork';
import {
  createMockCustomRpcEndpoint,
  createMockInfuraRpcEndpoint,
  createMockNetworkConfiguration,
} from './__fixtures__/mockNetwork';
import {
  appendMissingInfuraNetworks,
  createUpdateNetworkProps,
  getMappedNetworkConfiguration,
  getNewRPCIndex,
} from './update-network-utils';

describe('getMappedNetworkConfiguration() tests', () => {
  const arrangeRPCs = (clientIds: string[]) =>
    clientIds.map((id, idx) =>
      createMockCustomRpcEndpoint({
        networkClientId: id,
        url: `https://mock.rpc/${idx}`,
      }),
    );

  const createConfigs = (
    originalClientIds: string[],
    newClientIds: string[],
  ) => {
    const originalConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    originalConfig.rpcEndpoints = arrangeRPCs(originalClientIds);

    const newConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    newConfig.rpcEndpoints = arrangeRPCs(newClientIds);

    return { originalConfig, newConfig };
  };

  it('should map existing RPCs to the clients networkClientId', () => {
    const { originalConfig, newConfig } = createConfigs(
      ['DEVICE_1', 'DEVICE_2'],
      ['EXT_DEVICE_1', 'EXT_DEVICE_2'],
    );

    const result = getMappedNetworkConfiguration({
      originalNetworkConfiguration: originalConfig,
      newNetworkConfiguration: newConfig,
    });

    // We have mapped both existing networks to use the original clientIds
    expect(result.rpcEndpoints.map((r) => r.networkClientId)).toStrictEqual([
      'DEVICE_1',
      'DEVICE_2',
    ]);
  });

  it('should map new RPCs to no networkClientId (so the NetworkController can append them correctly)', () => {
    const { originalConfig, newConfig } = createConfigs(
      ['DEVICE_1', 'DEVICE_2'],
      ['EXT_DEVICE_1', 'EXT_DEVICE_2', 'EXT_DEVICE_3'],
    );

    const result = getMappedNetworkConfiguration({
      originalNetworkConfiguration: originalConfig,
      newNetworkConfiguration: newConfig,
    });

    // We have mapped both existing networks to use the original clientIds
    // We have also mapped the new RPC to 'undefined'/no networkClientId
    expect(result.rpcEndpoints.map((r) => r.networkClientId)).toStrictEqual([
      'DEVICE_1',
      'DEVICE_2',
      undefined,
    ]);
  });
});

describe('appendMissingInfuraNetworks() tests', () => {
  const createConfigs = (
    originalRpcEndpoints: RPCEndpoint[],
    newRpcEndpoints: RPCEndpoint[],
  ) => {
    const originalConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    originalConfig.rpcEndpoints = originalRpcEndpoints;

    const newConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    newConfig.rpcEndpoints = newRpcEndpoints;

    return { originalConfig, newConfig };
  };

  it('should append missing Infura networks (as we do not want to remove Infura RPCs)', () => {
    const infuraRpc = createMockInfuraRpcEndpoint();
    const { originalConfig, newConfig } = createConfigs([infuraRpc], []);

    const result = appendMissingInfuraNetworks({
      originalNetworkConfiguration: originalConfig,
      updateNetworkConfiguration: newConfig,
    });

    expect(result.rpcEndpoints).toHaveLength(1);
    expect(result.rpcEndpoints).toStrictEqual([infuraRpc]);
  });

  it('should not append if there are no Infura RPCs to add', () => {
    const infuraRpc = createMockInfuraRpcEndpoint();
    const { originalConfig, newConfig } = createConfigs([], [infuraRpc]);

    const result = appendMissingInfuraNetworks({
      originalNetworkConfiguration: originalConfig,
      updateNetworkConfiguration: newConfig,
    });

    expect(result.rpcEndpoints).toHaveLength(1); // no additional RPCs were added
  });

  it('should not append if the new config already has all the Infura RPCs', () => {
    const infuraRpc = createMockInfuraRpcEndpoint();
    const { originalConfig, newConfig } = createConfigs(
      [infuraRpc],
      [infuraRpc],
    );

    const result = appendMissingInfuraNetworks({
      originalNetworkConfiguration: originalConfig,
      updateNetworkConfiguration: newConfig,
    });

    expect(result.rpcEndpoints).toHaveLength(1); // no additional RPCs were added
  });
});

describe('getNewRPCIndex() tests', () => {
  const arrangeRPCs = (clientIds: string[]) =>
    clientIds.map((id) =>
      createMockCustomRpcEndpoint({
        networkClientId: id,
        url: `https://mock.rpc/${id}`,
      }),
    );

  const createConfigs = (
    originalClientIds: string[],
    newClientIds: string[],
  ) => {
    const originalConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    originalConfig.rpcEndpoints = arrangeRPCs(originalClientIds);

    const newConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    newConfig.rpcEndpoints = arrangeRPCs(newClientIds);

    return { originalConfig, newConfig };
  };

  it('should return the index of a new RPC if the selected RPC is removed', () => {
    const { originalConfig, newConfig } = createConfigs(
      ['DEVICE_1', 'DEVICE_2'],
      ['DEVICE_2'],
    );

    const selectedNetworkClientId = 'DEVICE_1';

    const result = getNewRPCIndex({
      originalNetworkConfiguration: originalConfig,
      updateNetworkConfiguration: newConfig,
      selectedNetworkClientId,
    });

    expect(result).toBe(0); // The new index should be the first available RPC
  });

  it('should return the same index if RPC ordering is unchanged', () => {
    const { originalConfig, newConfig } = createConfigs(
      ['DEVICE_1', 'DEVICE_2'],
      ['DEVICE_1', 'DEVICE_2'],
    );

    const selectedNetworkClientId = 'DEVICE_2';

    const result = getNewRPCIndex({
      originalNetworkConfiguration: originalConfig,
      updateNetworkConfiguration: newConfig,
      selectedNetworkClientId,
    });

    expect(result).toBe(1); // The index should remain the same
  });

  it('should return new index if the RPC ordering changed', () => {
    const { originalConfig, newConfig } = createConfigs(
      ['DEVICE_1', 'DEVICE_2'],
      ['DEVICE_0', 'DEVICE_1', 'DEVICE_2'],
    );

    const selectedNetworkClientId = 'DEVICE_2';

    const result = getNewRPCIndex({
      originalNetworkConfiguration: originalConfig,
      updateNetworkConfiguration: newConfig,
      selectedNetworkClientId,
    });

    expect(result).toBe(2); // The index has changed
  });

  it('should return undefined if the selected RPC is not in the original or new list', () => {
    const { originalConfig, newConfig } = createConfigs(
      ['DEVICE_1', 'DEVICE_2'],
      ['DEVICE_1', 'DEVICE_2'],
    );

    const selectedNetworkClientId = 'DEVICE_5'; // this is a networkClientId from a different configuration

    const result = getNewRPCIndex({
      originalNetworkConfiguration: originalConfig,
      updateNetworkConfiguration: newConfig,
      selectedNetworkClientId,
    });

    expect(result).toBeUndefined(); // No matching RPC found
  });
});

describe('createUpdateNetworkProps() tests', () => {
  const arrangeRPCs = (clientIds: string[]) =>
    clientIds.map((id) =>
      createMockCustomRpcEndpoint({
        networkClientId: id,
        url: `https://mock.rpc/${id}`,
      }),
    );

  const createConfigs = (
    originalClientIds: string[],
    newClientIds: string[],
  ) => {
    const originalConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    originalConfig.rpcEndpoints = arrangeRPCs(originalClientIds);

    const newConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    newConfig.rpcEndpoints = arrangeRPCs(newClientIds);

    return { originalConfig, newConfig };
  };

  it('should map new RPCs without networkClientId and keep existing ones', () => {
    const { originalConfig, newConfig } = createConfigs(
      ['DEVICE_1', 'DEVICE_2'],
      ['DEVICE_1', 'DEVICE_2', 'DEVICE_3'],
    );

    const selectedNetworkClientId = 'DEVICE_1';

    const result = createUpdateNetworkProps({
      originalNetworkConfiguration: originalConfig,
      newNetworkConfiguration: newConfig,
      selectedNetworkClientId,
    });

    expect(
      result.updateNetworkFields.rpcEndpoints.map((r) => r.networkClientId),
    ).toStrictEqual(['DEVICE_1', 'DEVICE_2', undefined]);
    expect(result.newSelectedRpcEndpointIndex).toBe(0); // the index for `DEVICE_1`
  });

  it('should append missing Infura networks', () => {
    const originalConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    const infuraRpc = createMockInfuraRpcEndpoint();
    const customRpcs = arrangeRPCs(['DEVICE_1']);
    originalConfig.rpcEndpoints.push(infuraRpc);
    originalConfig.rpcEndpoints.push(...customRpcs);

    const newConfig = createMockNetworkConfiguration({ chainId: '0x1' });
    newConfig.rpcEndpoints = customRpcs;

    const selectedNetworkClientId = 'DEVICE_1';

    const result = createUpdateNetworkProps({
      originalNetworkConfiguration: originalConfig,
      newNetworkConfiguration: newConfig,
      selectedNetworkClientId,
    });

    expect(result.updateNetworkFields.rpcEndpoints).toHaveLength(2);
    expect(
      result.updateNetworkFields.rpcEndpoints.map((r) => r.networkClientId),
    ).toStrictEqual([infuraRpc.networkClientId, 'DEVICE_1']);
    expect(result.newSelectedRpcEndpointIndex).toBe(1); // DEVICE_1 has a new index
  });
});
