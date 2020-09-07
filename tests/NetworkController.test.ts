import { stub } from 'sinon';
import NetworkController, { ProviderConfig } from '../src/network/NetworkController';

const Web3ProviderEngine = require('web3-provider-engine');

const RPC_TARGET = 'http://foo';

describe('NetworkController', () => {
  it('should set default state', () => {
    const controller = new NetworkController();
    expect(controller.state).toEqual({
      network: 'loading',
      provider: {
        type: 'mainnet',
      },
    });
  });

  it('should create a provider instance for default infura network', () => {
    const controller = new NetworkController();
    controller.providerConfig = {} as ProviderConfig;
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  it('should create a provider instance for kovan infura network', () => {
    const controller = new NetworkController(undefined, { network: '0', provider: { type: 'kovan' } });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  it('should create a provider instance for rinkeby infura network', () => {
    const controller = new NetworkController(undefined, { network: '0', provider: { type: 'rinkeby' } });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  it('should create a provider instance for ropsten infura network', () => {
    const controller = new NetworkController(undefined, { network: '0', provider: { type: 'ropsten' } });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  it('should create a provider instance for mainnet infura network', () => {
    const controller = new NetworkController(undefined, { network: '0', provider: { type: 'mainnet' } });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  it('should create a provider instance for local network', () => {
    const controller = new NetworkController(undefined, { network: '0', provider: { type: 'localhost' } });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  it('should create a provider instance for rpc network', () => {
    const controller = new NetworkController(undefined, {
      network: '0',
      provider: {
        rpcTarget: RPC_TARGET,
        type: 'rpc',
      },
    });
    controller.providerConfig = {} as ProviderConfig;
    expect(controller.provider instanceof Web3ProviderEngine).toBe(true);
  });

  it('should set new RPC target', () => {
    const controller = new NetworkController();
    controller.setRpcTarget(RPC_TARGET);
    expect(controller.state.provider.rpcTarget).toBe(RPC_TARGET);
  });

  it('should set new provider type', () => {
    const controller = new NetworkController();
    controller.setProviderType('localhost');
    expect(controller.state.provider.type).toBe('localhost');
  });

  it('should verify the network on an error', async () => {
    const controller = new NetworkController(undefined, { network: 'loading' });
    controller.providerConfig = {} as ProviderConfig;
    controller.lookupNetwork = stub();
    controller.provider.emit('error', {});
    expect((controller.lookupNetwork as any).called).toBe(true);
  });

  it('should look up the network', () => {
    return new Promise((resolve) => {
      const controller = new NetworkController();
      controller.providerConfig = {} as ProviderConfig;
      setTimeout(() => {
        expect(controller.state.network !== 'loading').toBe(true);
        resolve();
      }, 4500);
    });
  });
});
