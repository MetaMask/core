import sinon from 'sinon';
import Web3ProviderEngine from 'web3-provider-engine';
import { NetworkType } from '@metamask/controller-utils';
import {
  NetworkController,
  NetworksChainId,
  ProviderConfig,
} from './NetworkController';

const RPC_TARGET = 'http://foo';

describe('NetworkController', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should set default state', () => {
    const controller = new NetworkController();
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

  it('should throw when providerConfig property is accessed', () => {
    const controller = new NetworkController();
    expect(() => console.log(controller.providerConfig)).toThrow(
      'Property only used for setting',
    );
  });

  it('should create a provider instance for default infura network', () => {
    const testConfig = {
      infuraProjectId: 'foo',
    };
    const controller = new NetworkController(testConfig);
    controller.providerConfig = {} as ProviderConfig;
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  it('should create a provider instance for kovan infura network', () => {
    const testConfig = {
      infuraProjectId: 'foo',
    };
    const controller = new NetworkController(testConfig, {
      network: '0',
      provider: { type: 'kovan', chainId: NetworksChainId.kovan },
    });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should create a provider instance for rinkeby infura network', () => {
    const testConfig = {
      infuraProjectId: 'foo',
    };
    const controller = new NetworkController(testConfig, {
      network: '0',
      provider: { type: 'rinkeby', chainId: NetworksChainId.rinkeby },
    });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should create a provider instance for optimism network', () => {
    const testConfig = {
      infuraProjectId: 'foo',
    };
    const controller = new NetworkController(testConfig, {
      network: '10',
      provider: { type: 'optimism', chainId: NetworksChainId.optimism },
    });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(true);
  });

  it('should create a provider instance for ropsten infura network', () => {
    const testConfig = {
      infuraProjectId: 'foo',
    };
    const controller = new NetworkController(testConfig, {
      network: '0',
      provider: { type: 'ropsten', chainId: NetworksChainId.ropsten },
    });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should create a provider instance for mainnet infura network', () => {
    const testConfig = {
      infuraProjectId: 'foo',
    };
    const controller = new NetworkController(testConfig, {
      network: '0',
      provider: { type: 'mainnet', chainId: NetworksChainId.mainnet },
    });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should create a provider instance for local network', () => {
    const controller = new NetworkController(undefined, {
      network: '0',
      provider: { type: 'localhost', chainId: NetworksChainId.rpc },
    });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should create a provider instance for rpc network', () => {
    const controller = new NetworkController(undefined, {
      network: '0',
      provider: {
        rpcTarget: RPC_TARGET,
        type: 'rpc',
        chainId: NetworksChainId.mainnet,
      },
    });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should set new RPC target', () => {
    const controller = new NetworkController();
    controller.setRpcTarget(RPC_TARGET, NetworksChainId.rpc);
    expect(controller.state.provider.rpcTarget).toBe(RPC_TARGET);
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should set new provider type', () => {
    const controller = new NetworkController();
    controller.setProviderType('localhost');
    expect(controller.state.provider.type).toBe('localhost');
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should set new testnet provider type', () => {
    const controller = new NetworkController();
    controller.config.infuraProjectId = '0x0000';
    controller.setProviderType('rinkeby' as NetworkType);
    expect(controller.state.provider.type).toBe('rinkeby');
    expect(controller.state.provider.ticker).toBe('RinkebyETH');
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should set mainnet provider type', () => {
    const controller = new NetworkController();
    controller.config.infuraProjectId = '0x0000';
    controller.setProviderType('mainnet' as NetworkType);
    expect(controller.state.provider.type).toBe('mainnet');
    expect(controller.state.provider.ticker).toBe('ETH');
    expect(controller.state.isCustomNetwork).toBe(false);
  });

  it('should throw when setting an unrecognized provider type', () => {
    const controller = new NetworkController();
    expect(() => controller.setProviderType('junk' as NetworkType)).toThrow(
      "Unrecognized network type: 'junk'",
    );
  });

  it('should verify the network on an error', async () => {
    const testConfig = {
      infuraProjectId: 'foo',
    };
    const controller = new NetworkController(testConfig, {
      network: 'loading',
    });
    controller.providerConfig = {} as ProviderConfig;
    controller.lookupNetwork = sinon.stub();
    controller.provider.emit('error', {});
    expect((controller.lookupNetwork as any).called).toBe(true);
  });

  it('should look up the network', async () => {
    await new Promise((resolve) => {
      const testConfig = {
        // This test needs a real project ID as it makes a test
        // `eth_version` call; https://github.com/MetaMask/controllers/issues/1
        infuraProjectId: '341eacb578dd44a1a049cbc5f6fd4035',
      };
      const controller = new NetworkController(testConfig);
      controller.providerConfig = {} as ProviderConfig;
      setTimeout(() => {
        expect(controller.state.network !== 'loading').toBe(true);
        resolve('');
      }, 4500);
    });
  });
});
