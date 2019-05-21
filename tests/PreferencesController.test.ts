import PreferencesController from '../src/PreferencesController';

describe('PreferencesController', () => {
	it('should set default state', () => {
		const controller = new PreferencesController();
		expect(controller.state).toEqual({
			featureFlags: {},
			frequentRpcList: [],
			identities: {},
			ipfsGateway: 'https://ipfs.io/ipfs/',
			lostIdentities: {},
			selectedAddress: ''
		});
	});

	it('should add identities', () => {
		const controller = new PreferencesController();
		controller.addIdentities(['foo']);
		controller.addIdentities(['foo']);
		expect(controller.state.identities).toEqual({
			['0xfoO']: {
				address: '0xfoO',
				name: 'Account 1'
			}
		});
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

	it('should set identity label', () => {
		const controller = new PreferencesController();
		controller.addIdentities(['foo', 'bar']);
		controller.syncIdentities(['foo', 'bar']);
		expect(controller.state.identities).toEqual({
			['0xbar']: { address: '0xbar', name: 'Account 2' },
			['0xfoO']: { address: '0xfoO', name: 'Account 1' }
		});
		controller.syncIdentities(['foo']);
		expect(controller.state.identities).toEqual({
			['0xfoO']: { address: '0xfoO', name: 'Account 1' }
		});
		expect(controller.state.selectedAddress).toBe('0xfoO');
	});

	it('should update existing identities', () => {
		const controller = new PreferencesController();
		controller.updateIdentities(['foo', 'bar']);
		expect(controller.state.identities).toEqual({
			['0xbar']: { address: '0xbar', name: 'Account 2' },
			['0xfoO']: { address: '0xfoO', name: 'Account 1' }
		});
	});

	it('should add custom rpc url', () => {
		const controller = new PreferencesController();
		controller.addToFrequentRpcList('rpc_url');
		controller.addToFrequentRpcList('http://localhost:8545');
		expect(controller.state.frequentRpcList).toEqual(['rpc_url', 'http://localhost:8545']);
		controller.addToFrequentRpcList('rpc_url');
		expect(controller.state.frequentRpcList).toEqual(['http://localhost:8545', 'rpc_url']);
	});

	it('should remove custom rpc url', () => {
		const controller = new PreferencesController();
		controller.addToFrequentRpcList('rpc_url');
		expect(controller.state.frequentRpcList).toEqual(['rpc_url']);
		controller.removeFromFrequentRpcList('other_rpc_url');
		controller.removeFromFrequentRpcList('rpc_url');
		expect(controller.state.frequentRpcList).toEqual([]);
	});

	it('should set IPFS gateway', () => {
		const controller = new PreferencesController();
		controller.setIpfsGateway('https://ipfs.infura.io/ipfs/');
		expect(controller.state.ipfsGateway).toEqual('https://ipfs.infura.io/ipfs/');
	});
});
