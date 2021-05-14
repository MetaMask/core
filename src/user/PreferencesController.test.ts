import PreferencesController from './PreferencesController';

describe('PreferencesController', () => {
  it('should set default state', () => {
    const controller = new PreferencesController();
    expect(controller.state).toStrictEqual({
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
    controller.addIdentities(['0x00']);
    controller.addIdentities(['0x00']);
    expect(controller.state.identities['0x00'].address).toStrictEqual('0x00');
    expect(controller.state.identities['0x00'].name).toStrictEqual(
      'Account 1',
    );
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('should remove identity', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['0x00', '0x01', '0x02']);
    controller.update({ selectedAddress: '0x00' });
    controller.removeIdentity('0x00');
    controller.removeIdentity('0x02');
    controller.removeIdentity('0x00');
    expect(typeof controller.state.identities['0x00']).toBe('undefined');
    expect(controller.state.selectedAddress).toBe('0x01');
  });

  it('should set identity label', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['0x00']);
    controller.setAccountLabel('0x00', 'bar');
    controller.setAccountLabel('0x01', 'qux');
    expect(controller.state.identities['0x00'].name).toBe('bar');
    expect(controller.state.identities['0x01'].name).toBe('qux');
  });

  it('should sync identities', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['0x00', '0x01']);
    controller.syncIdentities(['0x00', '0x01']);
    expect(controller.state.identities['0x00'].address).toStrictEqual('0x00');
    expect(controller.state.identities['0x00'].name).toStrictEqual(
      'Account 1',
    );
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(controller.state.identities['0x01'].address).toStrictEqual('0x01');
    expect(controller.state.identities['0x01'].name).toStrictEqual(
      'Account 2',
    );
    expect(controller.state.identities['0x01'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
    controller.syncIdentities(['0x00']);
    expect(controller.state.identities['0x00'].address).toStrictEqual('0x00');
    expect(controller.state.identities['0x00'].name).toStrictEqual(
      'Account 1',
    );
    expect(controller.state.selectedAddress).toBe('0x00');
  });

  it('should add new identities', () => {
    const controller = new PreferencesController();
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.identities['0x00'].address).toStrictEqual('0x00');
    expect(controller.state.identities['0x00'].name).toStrictEqual(
      'Account 1',
    );
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(controller.state.identities['0x01'].address).toStrictEqual('0x01');
    expect(controller.state.identities['0x01'].name).toStrictEqual(
      'Account 2',
    );
    expect(controller.state.identities['0x01'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('should not update existing identities', () => {
    const controller = new PreferencesController(
      {},
      { identities: { '0x01': { address: '0x01', name: 'Custom name' } } },
    );
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.identities['0x00'].address).toStrictEqual('0x00');
    expect(controller.state.identities['0x00'].name).toStrictEqual(
      'Account 1',
    );
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(controller.state.identities['0x01'].address).toStrictEqual('0x01');
    expect(controller.state.identities['0x01'].name).toStrictEqual(
      'Custom name',
    );
    expect(controller.state.identities['0x01'].importTime).toBeUndefined();
  });

  it('should remove identities', () => {
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
      },
    );
    controller.updateIdentities(['0x00']);
    expect(controller.state.identities).toStrictEqual({
      '0x00': { address: '0x00', name: 'Account 1' },
    });
  });

  it('should not update selected address if it is still among identities', () => {
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
        selectedAddress: '0x01',
      },
    );
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.selectedAddress).toStrictEqual('0x01');
  });

  it('should update selected address to first identity if it was removed from identities', () => {
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x02': { address: '0x02', name: 'Account 3' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
        selectedAddress: '0x02',
      },
    );
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.selectedAddress).toStrictEqual('0x00');
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
    controller.addToFrequentRpcList(
      'http://localhost:8545',
      undefined,
      'LOCAL',
    );
    expect(controller.state.frequentRpcList).toStrictEqual([
      rpcUrlNetwork,
      localhostNetwork,
    ]);
    controller.addToFrequentRpcList('rpc_url');
    expect(controller.state.frequentRpcList).toStrictEqual([
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
    expect(controller.state.frequentRpcList).toStrictEqual([rpcUrlNetwork]);
    controller.removeFromFrequentRpcList('other_rpc_url');
    controller.removeFromFrequentRpcList('rpc_url');
    expect(controller.state.frequentRpcList).toStrictEqual([]);
  });

  it('should set IPFS gateway', () => {
    const controller = new PreferencesController();
    controller.setIpfsGateway('https://ipfs.infura.io/ipfs/');
    expect(controller.state.ipfsGateway).toStrictEqual(
      'https://ipfs.infura.io/ipfs/',
    );
  });

  it('should update selected address as checksummed', () => {
    const controller = new PreferencesController();
    controller.setSelectedAddress('0x95d2bc047b0ddec1e4a178eeb64d59f5e735cd0a');
    expect(controller.state.selectedAddress).toStrictEqual(
      '0x95D2bC047B0dDEc1E4A178EeB64d59F5E735cd0A',
    );
  });
});
