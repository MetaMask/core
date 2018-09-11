import { stub } from 'sinon';
import AssetsController from './AssetsController';

describe('PreferencesController', () => {
	let assetsController: AssetsController;
	beforeEach(() => {
		assetsController = new AssetsController();
	});

	it('should set default state', () => {
		expect(assetsController.state).toEqual({
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

	it('should remove token', () => {
		assetsController.addToken('foo', 'bar', 2);
		assetsController.removeToken('foo');
		expect(assetsController.state.tokens.length).toBe(0);
	});

	it('should remove collectible', async () => {
		await assetsController.addCollectible('0xfoO', 1234);
		assetsController.removeCollectible('0xfoO', 1234);
		expect(assetsController.state.tokens.length).toBe(0);
	});

	it('should add collectible', async () => {
		stub(assetsController, 'requestNFTCustomInformation').returns({ name: 'name', image: 'url' });
		await assetsController.addCollectible('foo', 1234);
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xfoO',
			image: 'url',
			name: 'name',
			tokenId: 1234
		});
	});

	it('should not add duplicated collectible', async () => {
		const func = stub(assetsController, 'requestNFTCustomInformation').returns({ name: 'name', image: 'url' });
		await assetsController.addCollectible('foo', 1234);
		await assetsController.addCollectible('foo', 1234);
		expect(assetsController.state.collectibles.length).toEqual(1);
		func.restore();
	});

	it('should request collectible custom data if address in contract metadata', async () => {
		expect(
			await assetsController.requestNFTCustomInformation('0x06012c8cf97BEaD5deAe237070F9587f8E7A266d', 740632)
		).not.toEqual({
			image: '',
			name: ''
		});
	});

	it('should request collectible default data if address not in contract metadata', async () => {
		const { name, image } = await assetsController.requestNFTCustomInformation('foo', 1);
		expect({ name, image }).toEqual({
			image: '',
			name: ''
		});
	});
});
