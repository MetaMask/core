import { createSandbox } from 'sinon';
import { getOnce } from 'fetch-mock';
import AssetsController from './AssetsController';
import ComposableController from './ComposableController';
import PreferencesController from './PreferencesController';
import { NetworkController } from './NetworkController';
import { AssetsContractController } from './AssetsContractController';

const HttpProvider = require('ethjs-provider-http');
const TOKENS = [{ address: '0xfoO', symbol: 'bar', decimals: 2 }];
const COLLECTIBLES = [{ address: '0xfoO', image: 'url', name: 'name', tokenId: 1234 }];
const GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const CKADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
const MAINNET_PROVIDER = new HttpProvider('https://mainnet.infura.io');

describe('AssetsController', () => {
	let assetsController: AssetsController;
	let preferences: PreferencesController;
	let network: NetworkController;
	let assetsContract: AssetsContractController;
	const sandbox = createSandbox();

	beforeEach(() => {
		assetsController = new AssetsController();
		preferences = new PreferencesController();
		network = new NetworkController();
		assetsContract = new AssetsContractController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assetsController, assetsContract, network, preferences]);
	});

	afterEach(() => {
		sandbox.reset();
	});

	it('should set default state', () => {
		expect(assetsController.state).toEqual({
			allCollectibles: {},
			allTokens: {},
			collectibles: [],
			tokens: []
		});
	});

	it('should add token', async () => {
		await assetsController.addToken('foo', 'bar', 2);
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'bar'
		});
		await assetsController.addToken('foo', 'baz', 2);
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'baz'
		});
	});

	it('should add token by selected address', async () => {
		const firstAddress = '0x123';
		const secondAddress = '0x321';

		preferences.update({ selectedAddress: firstAddress });
		await assetsController.addToken('foo', 'bar', 2);
		preferences.update({ selectedAddress: secondAddress });
		expect(assetsController.state.tokens.length).toEqual(0);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'bar'
		});
	});

	it('should add token by provider type', async () => {
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
		network.update({ provider: { type: firstNetworkType } });
		await assetsController.addToken('foo', 'bar', 2);
		network.update({ provider: { type: secondNetworkType } });
		expect(assetsController.state.tokens.length).toEqual(0);
		network.update({ provider: { type: firstNetworkType } });
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'bar'
		});
	});

	it('should remove token', async () => {
		await assetsController.addToken('foo', 'bar', 2);
		assetsController.removeToken('0xfoO');
		expect(assetsController.state.tokens.length).toBe(0);
	});

	it('should remove token by selected address', async () => {
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		preferences.update({ selectedAddress: firstAddress });
		await assetsController.addToken('fou', 'baz', 2);
		preferences.update({ selectedAddress: secondAddress });
		await assetsController.addToken('foo', 'bar', 2);
		assetsController.removeToken('0xfoO');
		expect(assetsController.state.tokens.length).toEqual(0);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xFOu',
			decimals: 2,
			symbol: 'baz'
		});
	});

	it('should remove token by provider type', async () => {
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
		network.update({ provider: { type: firstNetworkType } });
		await assetsController.addToken('fou', 'baz', 2);
		network.update({ provider: { type: secondNetworkType } });
		await assetsController.addToken('foo', 'bar', 2);
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
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		await assetsController.addCollectible('foo', 1234);
		expect(assetsController.state.collectibles).toEqual([
			{
				address: '0xfoO',
				image: '',
				name: '',
				tokenId: 1234
			}
		]);
	});

	it('should add collectible with enumerable support but no tokenURI', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		await assetsController.addCollectible('0x8c9b261Faef3b3C2e64ab5E58e04615F8c788099', 1);
		expect(assetsController.state.collectibles).toEqual([
			{
				address: '0x8c9b261Faef3b3C2e64ab5E58e04615F8c788099',
				image: '',
				name: 'LucidSight-MLB-NFT',
				tokenId: 1
			}
		]);
	});

	it('should add collectible with tokenURI, metadata and enumerable support', async () => {
		getOnce('https://api.godsunchained.com/card/1', () => ({
			body: JSON.stringify({ image: 'https://api.godsunchained.com/v0/image/7', name: 'Broken Harvester' })
		}));
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		await assetsController.addCollectible(GODSADDRESS, 1);
		expect(assetsController.state.collectibles).toEqual([
			{
				address: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
				image: 'https://api.godsunchained.com/v0/image/7',
				name: 'Broken Harvester',
				tokenId: 1
			}
		]);
	});

	it('should add collectible with no tokenURI with no enumerable neither metadata support', async () => {
		getOnce('https://api.cryptokitties.co/kitties/1', () => ({
			body: JSON.stringify({
				id: 1,
				image_url: 'https://img.cryptokitties.co/0x06012c8cf97bead5deae237070f9587f8e7a266d/1.png',
				name: 'Genesis'
			})
		}));
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		await assetsController.addCollectible(CKADDRESS, 1);
		expect(assetsController.state.collectibles).toEqual([
			{
				address: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
				image: 'https://img.cryptokitties.co/0x06012c8cf97bead5deae237070f9587f8e7a266d/1.png',
				name: 'Genesis',
				tokenId: 1
			}
		]);
	});

	it('should add collectible by selected address', async () => {
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		sandbox
			.stub(assetsController, 'getCollectibleCustomInformation' as any)
			.returns({ name: 'name', image: 'url' });
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
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
		sandbox
			.stub(assetsController, 'getCollectibleCustomInformation' as any)
			.returns({ name: 'name', image: 'url' });
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

	it('should remove collectible', async () => {
		sandbox
			.stub(assetsController, 'getCollectibleCustomInformation' as any)
			.returns({ name: 'name', image: 'url' });
		await assetsController.addCollectible('0xfoO', 1234);
		assetsController.removeCollectible('0xfoO', 1234);
		expect(assetsController.state.collectibles.length).toBe(0);
	});

	it('should remove collectible by selected address', async () => {
		sandbox
			.stub(assetsController, 'getCollectibleCustomInformation' as any)
			.returns({ name: 'name', image: 'url' });
		const firstAddress = '0x123';
		const secondAddress = '0x321';
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
		sandbox
			.stub(assetsController, 'getCollectibleCustomInformation' as any)
			.returns({ name: 'name', image: 'url' });
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
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
		const func = sandbox.stub(assetsController, 'getCollectibleCustomInformation' as any).returns({
			image: 'url',
			name: 'name'
		});
		await assetsController.addCollectible('foo', 1234);
		await assetsController.addCollectible('foo', 1234);
		expect(assetsController.state.collectibles.length).toEqual(1);
		func.restore();
	});

	it('should request collectible default data and handle on adding collectible', async () => {
		getOnce('https://api.cryptokitties.co/kitties/740632', () => ({
			body: JSON.stringify({
				id: 1,
				image_url: 'https://img.cryptokitties.co/0x06012c8cf97bead5deae237070f9587f8e7a266d/1.png',
				name: 'TestName'
			})
		}));
		await assetsController.addCollectible('0x06012c8cf97BEaD5deAe237070F9587f8E7A266d', 740632);
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
			image: 'https://img.cryptokitties.co/0x06012c8cf97bead5deae237070f9587f8e7a266d/1.png',
			name: 'TestName',
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
		const networkType = 'rinkeby';
		const address = '0x123';
		preferences.update({ selectedAddress: address });
		expect(assetsController.context.PreferencesController.state.selectedAddress).toEqual(address);
		network.update({ provider: { type: networkType } });
		expect(assetsController.context.NetworkController.state.provider.type).toEqual(networkType);
	});

	it('should return correct assets state', async () => {
		sandbox
			.stub(assetsController, 'getCollectibleCustomInformation' as any)
			.returns({ name: 'name', image: 'url' });
		await assetsController.addCollectible('foo', 1234);
		await assetsController.addToken('foo', 'bar', 2);
		expect(assetsController.state.tokens).toEqual(TOKENS);
		expect(assetsController.state.collectibles).toEqual(COLLECTIBLES);
	});
});
