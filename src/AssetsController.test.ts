import { stub } from 'sinon';
import AssetsController from './AssetsController';
import ComposableController from './ComposableController';
import PreferencesController from './PreferencesController';
import { NetworkController } from './NetworkController';

const TOKENS = [{ address: '0xfoO', symbol: 'bar', decimals: 2 }];
const COLLECTIBLES = [{ address: '0xfoO', image: 'url', name: 'name', tokenId: 1234 }];

describe('AssetsController', () => {
	let assetsController: AssetsController;
	beforeEach(() => {
		assetsController = new AssetsController();
	});

	it('should set default state', () => {
		expect(assetsController.state).toEqual({
			allCollectibles: {},
			allTokens: {},
			collectibles: [],
			tokens: []
		});
	});

	it('should add token', () => {
		assetsController.addToken('foo', 'bar', 2);
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'bar'
		});
		assetsController.addToken('foo', 'baz', 2);
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'baz'
		});
	});

	it('should add token by selected address', () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		preferences.update({ selectedAddress: firstAddress });
		assetsController.addToken('foo', 'bar', 2);
		preferences.update({ selectedAddress: secondAddress });
		expect(assetsController.state.tokens.length).toEqual(0);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'bar'
		});
	});

	it('should add token by provider type', () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		network.update({ provider: { type: firstNetworkType } });
		assetsController.addToken('foo', 'bar', 2);
		network.update({ provider: { type: secondNetworkType } });
		expect(assetsController.state.tokens.length).toEqual(0);
		network.update({ provider: { type: firstNetworkType } });
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'bar'
		});
	});

	it('should remove token', () => {
		assetsController.addToken('foo', 'bar', 2);
		assetsController.removeToken('0xfoO');
		expect(assetsController.state.tokens.length).toBe(0);
	});

	it('should remove token by selected address', () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		preferences.update({ selectedAddress: firstAddress });
		assetsController.addToken('fou', 'baz', 2);
		preferences.update({ selectedAddress: secondAddress });
		assetsController.addToken('foo', 'bar', 2);
		assetsController.removeToken('0xfoO');
		expect(assetsController.state.tokens.length).toEqual(0);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xFOu',
			decimals: 2,
			symbol: 'baz'
		});
	});

	it('should remove token by provider type', () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		network.update({ provider: { type: firstNetworkType } });
		assetsController.addToken('fou', 'baz', 2);
		network.update({ provider: { type: secondNetworkType } });
		assetsController.addToken('foo', 'bar', 2);
		assetsController.removeToken('0xfoO');
		expect(assetsController.state.tokens.length).toEqual(0);
		network.update({ provider: { type: firstNetworkType } });
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xFOu',
			decimals: 2,
			symbol: 'baz'
		});
	});

	it('should add collectible', async () => {
		stub(assetsController, 'requestNFTCustomInformation' as any).returns({ name: 'name', image: 'url' });
		await assetsController.addCollectible('foo', 1234);
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xfoO',
			image: 'url',
			name: 'name',
			tokenId: 1234
		});
	});

	it('should add collectible by selected address', async () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		stub(assetsController, 'requestNFTCustomInformation' as any).returns({ name: 'name', image: 'url' });
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		preferences.update({ selectedAddress: firstAddress });
		await assetsController.addCollectible('foo', 1234);
		preferences.update({ selectedAddress: secondAddress });
		await assetsController.addCollectible('fou', 4321);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xfoO',
			image: 'url',
			name: 'name',
			tokenId: 1234
		});
	});

	it('should add collectible by provider type', async () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
		stub(assetsController, 'requestNFTCustomInformation' as any).returns({ name: 'name', image: 'url' });
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		network.update({ provider: { type: firstNetworkType } });
		await assetsController.addCollectible('foo', 1234);
		network.update({ provider: { type: secondNetworkType } });
		expect(assetsController.state.collectibles.length).toEqual(0);
		network.update({ provider: { type: firstNetworkType } });
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xfoO',
			image: 'url',
			name: 'name',
			tokenId: 1234
		});
	});

	it('should remove collectible', () => {
		stub(assetsController, 'requestNFTCustomInformation' as any).returns({ name: 'name', image: 'url' });
		assetsController.addCollectible('0xfoO', 1234);
		assetsController.removeCollectible('0xfoO', 1234);
		expect(assetsController.state.collectibles.length).toBe(0);
	});

	it('should remove collectible by selected address', async () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		stub(assetsController, 'requestNFTCustomInformation' as any).returns({ name: 'name', image: 'url' });
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		preferences.update({ selectedAddress: firstAddress });
		await assetsController.addCollectible('fou', 4321);
		preferences.update({ selectedAddress: secondAddress });
		await assetsController.addCollectible('foo', 1234);
		assetsController.removeCollectible('0xfoO', 1234);
		expect(assetsController.state.collectibles.length).toEqual(0);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xFOu',
			image: 'url',
			name: 'name',
			tokenId: 4321
		});
	});

	it('should remove collectible by provider type', async () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		stub(assetsController, 'requestNFTCustomInformation' as any).returns({ name: 'name', image: 'url' });
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		network.update({ provider: { type: firstNetworkType } });
		await assetsController.addCollectible('fou', 4321);
		network.update({ provider: { type: secondNetworkType } });
		await assetsController.addCollectible('foo', 1234);
		assetsController.removeToken('0xfoO');
		assetsController.removeCollectible('0xfoO', 1234);
		expect(assetsController.state.collectibles.length).toEqual(0);
		network.update({ provider: { type: firstNetworkType } });
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xFOu',
			image: 'url',
			name: 'name',
			tokenId: 4321
		});
	});

	it('should not add duplicated collectible', async () => {
		const func = stub(assetsController, 'requestNFTCustomInformation' as any).returns({
			image: 'url',
			name: 'name'
		});
		await assetsController.addCollectible('foo', 1234);
		await assetsController.addCollectible('foo', 1234);
		expect(assetsController.state.collectibles.length).toEqual(1);
		func.restore();
	});

	it('should request collectible default data and handle on adding collectible', async () => {
		await assetsController.addCollectible('0x06012c8cf97BEaD5deAe237070F9587f8E7A266d', 740632);
		expect(assetsController.state.collectibles[0]).not.toEqual({
			address: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
			image: '',
			name: '',
			tokenId: 740632
		});
		await assetsController.addCollectible('foo', 1);
		expect(assetsController.state.collectibles[1]).toEqual({
			address: '0xfoO',
			image: '',
			name: '',
			tokenId: 1
		});
	});

	it('should subscribe to new sibling preference controllers', async () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const networkType = 'rinkeby';
		const address = '0x123';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, network, preferences]);
		preferences.update({ selectedAddress: address });
		expect(assetsController.context.PreferencesController.state.selectedAddress).toEqual(address);
		network.update({ provider: { type: networkType } });
		expect(assetsController.context.NetworkController.state.provider.type).toEqual(networkType);
	});

	it('should return correct assets state', async () => {
		stub(assetsController, 'requestNFTCustomInformation' as any).returns({ name: 'name', image: 'url' });
		await assetsController.addCollectible('foo', 1234);
		assetsController.addToken('foo', 'bar', 2);
		expect(assetsController.state.tokens).toEqual(TOKENS);
		expect(assetsController.state.collectibles).toEqual(COLLECTIBLES);
	});
});
