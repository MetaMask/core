import { createSandbox } from 'sinon';
import { getOnce } from 'fetch-mock';
import AssetsController from './AssetsController';
import ComposableController from './ComposableController';
import PreferencesController from './PreferencesController';
import { NetworkController } from './NetworkController';
import { AssetsContractController } from './AssetsContractController';

const HttpProvider = require('ethjs-provider-http');
const KUDOSADDRESS = '0x2aea4add166ebf38b63d09a75de1a7b94aa24163';
const MAINNET_PROVIDER = new HttpProvider('https://mainnet.infura.io');
const OPEN_SEA_API = 'https://api.opensea.io/api/v1/';

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

		getOnce(
			OPEN_SEA_API + 'asset_contract/0xfoO',
			() => ({
				body: JSON.stringify({
					description: 'Description',
					image_url: 'url',
					name: 'Name',
					symbol: 'FOO',
					total_supply: 0
				})
			}),
			{ overwriteRoutes: true }
		);
		getOnce(
			OPEN_SEA_API + 'asset_contract/0xFOu',
			() => ({
				body: JSON.stringify({
					description: 'Description',
					image_url: 'url',
					name: 'Name',
					symbol: 'FOU',
					total_supply: 10
				})
			}),
			{ overwriteRoutes: true }
		);
		getOnce(
			OPEN_SEA_API + 'asset/0xfoO/1',
			() => ({
				body: JSON.stringify({
					description: 'Description',
					image_preview_url: 'url',
					name: 'Name'
				})
			}),
			{ overwriteRoutes: true }
		);
		getOnce(
			OPEN_SEA_API + 'asset/0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163/1203',
			() => ({
				body: JSON.stringify({
					description: 'Kudos Description',
					image_preview_url: 'Kudos url',
					name: 'Kudos Name'
				})
			}),
			{ overwriteRoutes: true }
		);
		getOnce(
			'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
			() => ({
				body: JSON.stringify({
					image: 'Kudos Image',
					name: 'Kudos Name'
				})
			}),
			{ overwriteRoutes: true }
		);
		getOnce(
			OPEN_SEA_API + 'asset/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab/798958393',
			() => ({
				throws: new TypeError('Failed to fetch')
			}),
			{ overwriteRoutes: true }
		);
		getOnce(
			OPEN_SEA_API + 'asset_contract/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
			() => ({
				throws: new TypeError('Failed to fetch')
			}),
			{ overwriteRoutes: true }
		);
		getOnce(
			OPEN_SEA_API + 'asset_contract/0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
			() => ({
				body: JSON.stringify({
					description: 'Kudos Description',
					image_url: 'Kudos url',
					name: 'Kudos',
					symbol: 'KDO',
					total_supply: 10
				})
			}),
			{ overwriteRoutes: true }
		);
	});

	afterEach(() => {
		sandbox.reset();
	});

	it('should set default state', () => {
		expect(assetsController.state).toEqual({
			allCollectibleContracts: {},
			allCollectibles: {},
			allTokens: {},
			collectibleContracts: [],
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

	it('should add collectible and collectible contract', async () => {
		await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xfoO',
			description: 'description',
			image: 'image',
			name: 'name',
			tokenId: 1
		});
		expect(assetsController.state.collectibleContracts[0]).toEqual({
			address: '0xfoO',
			description: 'Description',
			logo: 'url',
			name: 'Name',
			symbol: 'FOO',
			totalSupply: 0
		});
	});

	it('should not duplicate collectible nor collectible contract if already added', async () => {
		await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
		await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
		expect(assetsController.state.collectibles.length).toEqual(1);
		expect(assetsController.state.collectibleContracts.length).toEqual(1);
	});

	it('should not add collectible contract if collectible contract already exists', async () => {
		await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
		await assetsController.addCollectible('foo', 2, { name: 'name', image: 'image', description: 'description' });
		expect(assetsController.state.collectibles.length).toEqual(2);
		expect(assetsController.state.collectibleContracts.length).toEqual(1);
	});

	it('should add collectible and get information from OpenSea', async () => {
		await assetsController.addCollectible('foo', 1);
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xfoO',
			description: 'Description',
			image: 'url',
			name: 'Name',
			tokenId: 1
		});
	});

	it('should add collectible and get collectible contract information from contract', async () => {
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		sandbox.stub(assetsController, 'getCollectibleContractInformationFromApi' as any).returns(undefined);
		sandbox.stub(assetsController, 'getCollectibleInformationFromApi' as any).returns(undefined);
		await assetsController.addCollectible(KUDOSADDRESS, 1203);
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
			description: undefined,
			image: 'Kudos Image',
			name: 'Kudos Name',
			tokenId: 1203
		});
		expect(assetsController.state.collectibleContracts[0]).toEqual({
			address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
			description: undefined,
			logo: undefined,
			name: 'KudosToken',
			symbol: 'KDO',
			totalSupply: undefined
		});
	});

	it('should add collectible by selected address', async () => {
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		sandbox
			.stub(assetsController, 'getCollectibleInformation' as any)
			.returns({ name: 'name', image: 'url', description: 'description' });
		preferences.update({ selectedAddress: firstAddress });
		await assetsController.addCollectible('foo', 1234);
		preferences.update({ selectedAddress: secondAddress });
		await assetsController.addCollectible('fou', 4321);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xfoO',
			description: 'description',
			image: 'url',
			name: 'name',
			tokenId: 1234
		});
	});

	it('should add collectible by provider type', async () => {
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'ropsten';
		sandbox
			.stub(assetsController, 'getCollectibleInformation' as any)
			.returns({ name: 'name', image: 'url', description: 'description' });
		network.update({ provider: { type: firstNetworkType } });
		await assetsController.addCollectible('foo', 1234);
		network.update({ provider: { type: secondNetworkType } });
		expect(assetsController.state.collectibles.length).toEqual(0);
		network.update({ provider: { type: firstNetworkType } });
		expect(assetsController.state.collectibles[0]).toEqual({
			address: '0xfoO',
			description: 'description',
			image: 'url',
			name: 'name',
			tokenId: 1234
		});
	});

	it('should not add collectibles with no contract information when auto detecting', async () => {
		await assetsController.addCollectible('0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab', 123, undefined, true);
		expect(assetsController.state.collectibles).toEqual([]);
		expect(assetsController.state.collectibleContracts).toEqual([]);
		await assetsController.addCollectible('0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163', 1203, undefined, true);
		expect(assetsController.state.collectibles).toEqual([
			{
				address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
				description: 'Kudos Description',
				image: 'Kudos url',
				name: 'Kudos Name',
				tokenId: 1203
			}
		]);
		expect(assetsController.state.collectibleContracts).toEqual([
			{
				address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
				description: 'Kudos Description',
				logo: 'Kudos url',
				name: 'Kudos',
				symbol: 'KDO',
				totalSupply: 10
			}
		]);
	});

	it('should remove collectible and collectible contract', async () => {
		await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
		assetsController.removeCollectible('0xfoO', 1);
		expect(assetsController.state.collectibles.length).toEqual(0);
		expect(assetsController.state.collectibleContracts.length).toEqual(0);
	});

	it('should not remove collectible contract if collectible still exists', async () => {
		await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
		await assetsController.addCollectible('foo', 2, { name: 'name', image: 'image', description: 'description' });
		assetsController.removeCollectible('0xfoO', 1);
		expect(assetsController.state.collectibles.length).toEqual(1);
		expect(assetsController.state.collectibleContracts.length).toEqual(1);
	});

	it('should remove collectible by selected address', async () => {
		sandbox
			.stub(assetsController, 'getCollectibleInformation' as any)
			.returns({ name: 'name', image: 'url', description: 'description' });
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
			description: 'description',
			image: 'url',
			name: 'name',
			tokenId: 4321
		});
	});

	it('should remove collectible by provider type', async () => {
		sandbox
			.stub(assetsController, 'getCollectibleInformation' as any)
			.returns({ name: 'name', image: 'url', description: 'description' });
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
			description: 'description',
			image: 'url',
			name: 'name',
			tokenId: 4321
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
});
