import PreferencesController from './PreferencesController';
import { stub } from 'sinon';

describe('PreferencesController', () => {
	it('should set default state', () => {
		const controller = new PreferencesController();
		expect(controller.state).toEqual({
			collectibles: [],
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

	it('should add collectible', async () => {
		const controller = new PreferencesController();
		stub(controller, 'requestNFTCustomInformation').returns({ name: 'name', image: 'url' });
		await controller.addCollectible('foo', 1234);
		expect(controller.state.collectibles[0]).toEqual({
			address: '0xfoO',
			image: 'url',
			name: 'name',
			tokenId: 1234
		});
	});

	it('should not add duplicated collectible', async () => {
		const controller = new PreferencesController();
		const func = stub(controller, 'requestNFTCustomInformation').returns({ name: 'name', image: 'url' });
		await controller.addCollectible('foo', 1234);
		await controller.addCollectible('foo', 1234);
		expect(controller.state.collectibles.length).toEqual(1);
		func.restore();
	});

	it('should request collectible custom data if address in contract metadata', async () => {
		const controller = new PreferencesController();
		expect(
			await controller.requestNFTCustomInformation('0x06012c8cf97BEaD5deAe237070F9587f8E7A266d', 740632)
		).not.toEqual({
			image: '',
			name: ''
		});
	});

	it('should request collectible default data if address not in contract metadata', async () => {
		const controller = new PreferencesController();
		const { name, image } = await controller.requestNFTCustomInformation('foo', 1);
		expect({ name, image }).toEqual({
			image: '',
			name: ''
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

	it('should remove collectible', async () => {
		const controller = new PreferencesController();
		await controller.addCollectible('0xfoO', 1234);
		controller.removeCollectible('0xfoO', 1234);
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
