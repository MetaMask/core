import PreferencesController from './PreferencesController';

describe('PreferencesController', () => {
	it('should set default state', () => {
		const controller = new PreferencesController();
		expect(controller.state).toEqual({
			featureFlags: {},
			identities: {},
			lostIdentities: {},
			selectedAddress: '',
			tokens: []
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

	it('should add token', () => {
		const controller = new PreferencesController();
		controller.addToken('foo', 'bar', 2);
		expect(controller.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'bar'
		});
		controller.addToken('foo', 'baz', 2);
		expect(controller.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'baz'
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

	it('should remove token', () => {
		const controller = new PreferencesController();
		controller.addToken('foo', 'bar', 2);
		controller.removeToken('foo');
		expect(controller.state.tokens.length).toBe(0);
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
});
