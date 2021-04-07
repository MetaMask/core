import PreferencesController from './PreferencesController';

describe('PreferencesController', () => {
  it('should set default state', () => {
    const controller = new PreferencesController();
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
    const controller = new PreferencesController();
    controller.addIdentities(['foo']);
    controller.addIdentities(['foo']);
    expect(controller.state.identities['0xfoO'].address).toEqual('0xfoO');
    expect(controller.state.identities['0xfoO'].name).toEqual('Account 1');
    expect(controller.state.identities['0xfoO'].importTime).toBeLessThanOrEqual(Date.now());
  });

  it('should remove identity', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['foo', 'bar', 'baz']);
    controller.update({ selectedAddress: '0xfoO' });
    controller.removeIdentity('foo');
    controller.removeIdentity('baz');
    controller.removeIdentity('foo');
    expect(typeof controller.state.identities['0xfoO']).toBe('undefined');
    expect(controller.state.selectedAddress).toBe('0xbar');
  });

  it('should set identity label', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['foo']);
    controller.setAccountLabel('foo', 'bar');
    controller.setAccountLabel('baz', 'qux');
    expect(controller.state.identities['0xfoO'].name).toBe('bar');
    expect(controller.state.identities['0xBaZ'].name).toBe('qux');
  });

  it('should sync identities', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['foo', 'bar']);
    controller.syncIdentities(['foo', 'bar']);
    expect(controller.state.identities['0xfoO'].address).toEqual('0xfoO');
    expect(controller.state.identities['0xfoO'].name).toEqual('Account 1');
    expect(controller.state.identities['0xfoO'].importTime).toBeLessThanOrEqual(Date.now());
    expect(controller.state.identities['0xbar'].address).toEqual('0xbar');
    expect(controller.state.identities['0xbar'].name).toEqual('Account 2');
    expect(controller.state.identities['0xbar'].importTime).toBeLessThanOrEqual(Date.now());
    controller.syncIdentities(['foo']);
    expect(controller.state.identities['0xfoO'].address).toEqual('0xfoO');
    expect(controller.state.identities['0xfoO'].name).toEqual('Account 1');
    expect(controller.state.selectedAddress).toBe('0xfoO');
  });

  it('should add new identities', () => {
    const controller = new PreferencesController();
    controller.updateIdentities(['foo', 'bar']);
    expect(controller.state.identities['0xfoO'].address).toEqual('0xfoO');
    expect(controller.state.identities['0xfoO'].name).toEqual('Account 1');
    expect(controller.state.identities['0xfoO'].importTime).toBeLessThanOrEqual(Date.now());
    expect(controller.state.identities['0xbar'].address).toEqual('0xbar');
    expect(controller.state.identities['0xbar'].name).toEqual('Account 2');
    expect(controller.state.identities['0xbar'].importTime).toBeLessThanOrEqual(Date.now());
  });

  it('should not update existing identities', () => {
    const controller = new PreferencesController(
      {},
      { identities: { '0xbar': { address: '0xbar', name: 'Custom name' } } },
    );
    controller.updateIdentities(['foo', 'bar']);
    expect(controller.state.identities['0xfoO'].address).toEqual('0xfoO');
    expect(controller.state.identities['0xfoO'].name).toEqual('Account 1');
    expect(controller.state.identities['0xfoO'].importTime).toBeLessThanOrEqual(Date.now());
    expect(controller.state.identities['0xbar'].address).toEqual('0xbar');
    expect(controller.state.identities['0xbar'].name).toEqual('Custom name');
    expect(controller.state.identities['0xbar'].importTime).toBeUndefined();
  });

  it('should remove identities', () => {
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0xbar': { address: '0xbar', name: 'Account 2' },
          '0xfoO': { address: '0xfoO', name: 'Account 1' },
        },
      },
    );
    controller.updateIdentities(['foo']);
    expect(controller.state.identities).toEqual({
      '0xfoO': { address: '0xfoO', name: 'Account 1' },
    });
  });

  it('should not update selected address if it is still among identities', () => {
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0xbar': { address: '0xbar', name: 'Account 2' },
          '0xfoO': { address: '0xfoO', name: 'Account 1' },
        },
        selectedAddress: '0xbar',
      },
    );
    controller.updateIdentities(['foo', 'bar']);
    expect(controller.state.selectedAddress).toEqual('0xbar');
  });

  it('should update selected address to first identity if it was removed from identities', () => {
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0xbar': { address: '0xbar', name: 'Account 2' },
          '0xbaz': { address: '0xbaz', name: 'Account 3' },
          '0xfoO': { address: '0xfoO', name: 'Account 1' },
        },
        selectedAddress: '0xbaz',
      },
    );
    controller.updateIdentities(['foo', 'bar']);
    expect(controller.state.selectedAddress).toEqual('0xfoO');
  });

  it('should add custom rpc url', () => {
    const controller = new PreferencesController();
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
    const controller = new PreferencesController();
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
    const controller = new PreferencesController();
    controller.setIpfsGateway('https://ipfs.infura.io/ipfs/');
    expect(controller.state.ipfsGateway).toEqual('https://ipfs.infura.io/ipfs/');
  });

  it('should update selected address as checksummed', () => {
    const controller = new PreferencesController();
    controller.setSelectedAddress('0x95d2bc047b0ddec1e4a178eeb64d59f5e735cd0a');
    expect(controller.state.selectedAddress).toEqual('0x95D2bC047B0dDEc1E4A178EeB64d59F5E735cd0A');
  });
});
