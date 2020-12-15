import PreferencesController from '../src/user/PreferencesController';

describe('PreferencesController', () => {
  let controller: PreferencesController;
  beforeEach(() => {
    controller = new PreferencesController();
  });
  afterEach(() => {
    controller.destroy();
  });
  it('should set default state', () => {
    expect(controller.state).toEqual({
      featureFlags: {},
      frequentRpcList: [],
      identities: {},
      ipfsGateway: 'https://ipfs.io/ipfs/',
      lostIdentities: {},
      selectedAddress: '',
    });
  });

  it('should add identities', () => {
    controller.addIdentities(['foo']);
    controller.addIdentities(['foo']);
    expect(controller.state.identities).toEqual({
      '0xfoO': {
        address: '0xfoO',
        name: 'Account 1',
      },
    });
  });

  it('should remove identity', () => {
    controller.addIdentities(['foo', 'bar', 'baz']);
    controller.setSelectedAddress('0xfoO');
    controller.removeIdentity('foo');
    controller.removeIdentity('baz');
    controller.removeIdentity('foo');
    expect(typeof controller.state.identities['0xfoO']).toBe('undefined');
    expect(controller.state.selectedAddress).toBe('0xbar');
  });

  it('should set identity label', () => {
    controller.addIdentities(['foo']);
    controller.setAccountLabel('foo', 'bar');
    controller.setAccountLabel('baz', 'qux');
    expect(controller.state.identities['0xfoO'].name).toBe('bar');
    expect(controller.state.identities['0xBaZ'].name).toBe('qux');
  });

  it('should sync identities', () => {
    controller.addIdentities(['foo', 'bar']);
    controller.syncIdentities(['foo', 'bar']);
    expect(controller.state.identities).toEqual({
      '0xbar': { address: '0xbar', name: 'Account 2' },
      '0xfoO': { address: '0xfoO', name: 'Account 1' },
    });
    controller.syncIdentities(['foo']);
    expect(controller.state.identities).toEqual({
      '0xfoO': { address: '0xfoO', name: 'Account 1' },
    });
    expect(controller.state.selectedAddress).toBe('0xfoO');
  });

  it('should update existing identities', () => {
    controller.updateIdentities(['foo', 'bar']);
    expect(controller.state.identities).toEqual({
      '0xbar': { address: '0xbar', name: 'Account 2' },
      '0xfoO': { address: '0xfoO', name: 'Account 1' },
    });
  });

  it('should add custom rpc url', () => {
    const rpcUrlNetwork = {
      chainId: undefined,
      nickname: 'RPC',
      rpcPrefs: undefined,
      rpcUrl: 'rpc_url',
      ticker: 'RPC',
    };
    const localhostNetwork = {
      chainId: undefined,
      nickname: undefined,
      rpcPrefs: undefined,
      rpcUrl: 'http://localhost:8545',
      ticker: 'LOCAL',
    };
    controller.addToFrequentRpcList('rpc_url', undefined, 'RPC', 'RPC');
    controller.addToFrequentRpcList('http://localhost:8545', undefined, 'LOCAL');
    expect(controller.state.frequentRpcList).toEqual([rpcUrlNetwork, localhostNetwork]);
    controller.addToFrequentRpcList('rpc_url');
    expect(controller.state.frequentRpcList).toEqual([
      localhostNetwork,
      { ...rpcUrlNetwork, nickname: undefined, ticker: undefined },
    ]);
  });

  it('should remove custom rpc url', () => {
    const rpcUrlNetwork = {
      chainId: undefined,
      nickname: undefined,
      rpcPrefs: undefined,
      rpcUrl: 'rpc_url',
      ticker: undefined,
    };
    controller.addToFrequentRpcList('rpc_url');
    expect(controller.state.frequentRpcList).toEqual([rpcUrlNetwork]);
    controller.removeFromFrequentRpcList('other_rpc_url');
    controller.removeFromFrequentRpcList('rpc_url');
    expect(controller.state.frequentRpcList).toEqual([]);
  });

  it('should set IPFS gateway', () => {
    controller.setIpfsGateway('https://ipfs.infura.io/ipfs/');
    expect(controller.state.ipfsGateway).toEqual('https://ipfs.infura.io/ipfs/');
  });

  it('should update selected address as checksummed', () => {
    controller.setSelectedAddress('0x95d2bc047b0ddec1e4a178eeb64d59f5e735cd0a');
    expect(controller.state.selectedAddress).toEqual('0x95D2bC047B0dDEc1E4A178EeB64d59F5E735cd0A');
  });
});
