import sinon from 'sinon';
import Web3ProviderEngine from 'web3-provider-engine';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  NetworkController,
  NetworkControllerMessenger,
  NetworkControllerOptions,
  NetworksChainId,
  NetworkType,
  ProviderConfig,
} from './NetworkController';

const RPC_TARGET = 'http://foo';

const setupController = (
  pType: NetworkType,
  messenger: NetworkControllerMessenger,
) => {
  const networkControllerOpts: NetworkControllerOptions = {
    infuraProjectId: 'foo',
    state: {
      network: '0',
      provider: {
        type: pType,
        chainId: NetworksChainId[pType],
      },
      properties: { isEIP1559Compatible: false },
    },
    messenger,
  };
  const controller = new NetworkController(networkControllerOpts);
  controller.providerConfig = {} as ProviderConfig;
  return controller;
};

describe('NetworkController', () => {
  let messenger: NetworkControllerMessenger;

  beforeEach(() => {
    messenger = new ControllerMessenger().getRestricted({
      name: 'NetworkController',
      allowedEvents: ['NetworkController:providerChange'],
      allowedActions: [],
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should set default state', () => {
    const controller = new NetworkController({
      messenger,
      infuraProjectId: 'potate',
    });

    expect(controller.state).toStrictEqual({
      network: 'loading',
      isCustomNetwork: false,
      properties: { isEIP1559Compatible: false },
      provider: {
        type: 'mainnet',
        chainId: '1',
      },
    });
  });

  it('should create a provider instance for default infura network', () => {
    const networkControllerOpts = {
      infuraProjectId: 'foo',
      messenger,
    };
    const controller = new NetworkController(networkControllerOpts);
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  (
    ['kovan', 'rinkeby', 'ropsten', 'mainnet', 'localhost'] as NetworkType[]
  ).forEach((n) => {
    it(`should create a provider instance for ${n} infura network`, () => {
      const networkController = setupController(n, messenger);
      expect(networkController.provider instanceof Web3ProviderEngine).toBe(
        true,
      );
      expect(networkController.state.isCustomNetwork).toBe(false);
    });
  });

  it('should create a provider instance for optimism network', () => {
    const networkControllerOpts: NetworkControllerOptions = {
      infuraProjectId: 'foo',
      state: {
        network: '0',
        provider: {
          rpcTarget: RPC_TARGET,
          type: 'rpc',
          chainId: '10',
        },
        properties: { isEIP1559Compatible: false },
      },
      messenger,
    };
    const controller = new NetworkController(networkControllerOpts);
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(true);
  });

  it('should create a provider instance for rpc network', () => {
    const networkControllerOpts: NetworkControllerOptions = {
      infuraProjectId: 'foo',
      state: {
        network: '0',
        provider: {
          rpcTarget: RPC_TARGET,
          type: 'rpc',
          chainId: NetworksChainId.mainnet,
        },
      },
      messenger,
    };
    const controller = new NetworkController(networkControllerOpts);
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should set new RPC target', () => {
    const controller = new NetworkController({ messenger });
    controller.setRpcTarget(RPC_TARGET, NetworksChainId.rpc);
    expect(controller.state.provider.rpcTarget).toBe(RPC_TARGET);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should set new provider type', () => {
    const controller = new NetworkController({ messenger });
    controller.setProviderType('localhost');
    expect(controller.state.provider.type).toBe('localhost');
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should set new testnet provider type', () => {
    const controller = new NetworkController({
      messenger,
      infuraProjectId: '123',
    });
    controller.setProviderType('goerli' as NetworkType);
    expect(controller.state.provider.type).toBe('goerli');
    expect(controller.state.provider.ticker).toBe('GoerliETH');
    expect(controller.state.isCustomNetwork).toBe(false);
    expect(controller.state.provider.rpcTarget).toBeUndefined();
    expect(controller.state.provider.nickname).toBeUndefined();
  });

  it('should set mainnet provider type', () => {
    const controller = new NetworkController({
      messenger,
      infuraProjectId: '123',
    });
    controller.setProviderType('mainnet' as NetworkType);
    expect(controller.state.provider.type).toBe('mainnet');
    expect(controller.state.provider.ticker).toBe('ETH');
    expect(controller.state.isCustomNetwork).toBe(false);
    expect(controller.state.provider.rpcTarget).toBeUndefined();
    expect(controller.state.provider.nickname).toBeUndefined();
  });

  it('should throw when setting an unrecognized provider type', () => {
    const controller = new NetworkController({ messenger });
    expect(() => controller.setProviderType('junk' as NetworkType)).toThrow(
      "Unrecognized network type: 'junk'",
    );
  });

  it('should verify the network on an error', async () => {
    const controller = new NetworkController({
      messenger,
      infuraProjectId: '123',
      state: {
        network: 'loading',
      },
    });
    controller.providerConfig = {} as ProviderConfig;
    controller.lookupNetwork = sinon.stub();
    controller.provider.emit('error', {});
    expect((controller.lookupNetwork as any).called).toBe(true);
  });

  it('should look up the network', async () => {
    const testConfig = {
      // This test needs a real project ID as it makes a test
      // `eth_version` call; https://github.com/MetaMask/controllers/issues/1
      infuraProjectId: '341eacb578dd44a1a049cbc5f6fd4035',
      messenger,
    };
    const event = 'NetworkController:providerChange';
    const controller = new NetworkController(testConfig);

    await new Promise((resolve) => {
      const handleProviderChange = () => {
        expect(controller.state.network !== 'loading').toBe(true);
        messenger.unsubscribe(event, handleProviderChange);
        resolve('');
      };
      messenger.subscribe(event, handleProviderChange);

      controller.providerConfig = {} as ProviderConfig;
    });
  });
});
