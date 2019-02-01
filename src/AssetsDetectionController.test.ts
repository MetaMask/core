import { createSandbox } from 'sinon';
import { AssetsDetectionController } from './AssetsDetectionController';
import { NetworkController } from './NetworkController';
import { PreferencesController } from './PreferencesController';
import { ComposableController } from './ComposableController';
import { AssetsController } from './AssetsController';
import { AssetsContractController } from './AssetsContractController';
import { getOnce } from 'fetch-mock';

const BN = require('ethereumjs-util').BN;
const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const ROPSTEN = 'ropsten';
const TOKENS = [{ address: '0xfoO', symbol: 'bar', decimals: 2 }];
const OPEN_SEA_API = 'https://api.opensea.io/api/v1/';

describe('AssetsDetectionController', () => {
	let assetsDetection: AssetsDetectionController;
	let preferences: PreferencesController;
	let network: NetworkController;
	let assets: AssetsController;
	let assetsContract: AssetsContractController;
	const sandbox = createSandbox();

	beforeEach(() => {
		assetsDetection = new AssetsDetectionController();
		preferences = new PreferencesController();
		network = new NetworkController();
		assets = new AssetsController();
		assetsContract = new AssetsContractController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsContract, assetsDetection, network, preferences]);

		getOnce(
			OPEN_SEA_API + 'asset_contract/0x1d963688FE2209A98dB35C67A041524822Cf04ff',
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
			OPEN_SEA_API + 'assets?owner=',
			() => ({
				body: JSON.stringify({
					assets: [
						{
							asset_contract: {
								address: '0x1d963688fe2209a98db35c67a041524822cf04ff'
							},
							image_preview_url: 'image/2577.png',
							token_id: '2577'
						},
						{
							asset_contract: {
								address: '0x1d963688fe2209a98db35c67a041524822cf04ff'
							},
							image_preview_url: 'image/2574.png',
							token_id: '2574'
						}
					]
				})
			}),
			{ overwriteRoutes: true }
		);
	});

	afterEach(() => {
		sandbox.reset();
	});

	it('should set default config', () => {
		expect(assetsDetection.config).toEqual({
			interval: DEFAULT_INTERVAL,
			networkType: 'ropsten',
			selectedAddress: '',
			tokens: []
		});
	});

	it('should poll on correct interval', () => {
		const func = sandbox.stub(global, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new AssetsDetectionController({ interval: 1337 });
		expect(func.getCall(0).args[1]).toBe(1337);
		func.restore();
	});

	it('should poll and detect assets on interval while mainnet', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetection.configure({ networkType: MAINNET });
		const detectTokens = sandbox.stub(assetsDetection, 'detectTokens').returns(null);
		const detectCollectibles = sandbox.stub(assetsDetection, 'detectCollectibles').returns(null);
		clock.tick(180001);
		expect(detectTokens.called).toBe(true);
		expect(detectCollectibles.called).toBe(true);
	});

	it('should detect mainnet correctly', () => {
		assetsDetection.configure({ networkType: MAINNET });
		expect(assetsDetection.isMainnet()).toEqual(true);
		assetsDetection.configure({ networkType: ROPSTEN });
		expect(assetsDetection.isMainnet()).toEqual(false);
	});

	it('should detect assets only while mainnet', () => {
		const clock = sandbox.useFakeTimers();
		const detectTokens = sandbox.stub(assetsDetection, 'detectTokens').returns(null);
		const detectCollectibles = sandbox.stub(assetsDetection, 'detectCollectibles').returns(null);
		clock.tick(180001);
		expect(detectTokens.called).toBe(false);
		expect(detectCollectibles.called).toBe(false);
		assetsDetection.configure({ networkType: MAINNET });
		clock.tick(180001);
		expect(detectTokens.called).toBe(true);
		expect(detectCollectibles.called).toBe(true);
	});

	it('should call detect tokens correctly', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetection.configure({ networkType: MAINNET });
		const detectTokens = sandbox.stub(assetsDetection, 'detectTokens').returns(null);
		const detectCollectibles = sandbox.stub(assetsDetection, 'detectCollectibles').returns(null);
		clock.tick(180001);
		expect(detectTokens.called).toBe(true);
		expect(detectCollectibles.called).toBe(true);
	});

	it('should call detect collectibles correctly', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetection.configure({ networkType: MAINNET });
		const detectTokens = sandbox.stub(assetsDetection, 'detectTokens').returns(null);
		const detectCollectibles = sandbox.stub(assetsDetection, 'detectCollectibles').returns(null);
		clock.tick(180001);
		expect(detectCollectibles.called).toBe(true);
		expect(detectTokens.called).toBe(true);
	});

	it('should detect and add collectibles correctly', async () => {
		assetsDetection.configure({ networkType: MAINNET });
		await assetsDetection.detectCollectibles();
		expect(assets.state.collectibles).toEqual([
			{
				address: '0x1d963688FE2209A98dB35C67A041524822Cf04ff',
				description: undefined,
				image: 'image/2577.png',
				name: undefined,
				tokenId: 2577
			},
			{
				address: '0x1d963688FE2209A98dB35C67A041524822Cf04ff',
				description: undefined,
				image: 'image/2574.png',
				name: undefined,
				tokenId: 2574
			}
		]);
	});

	it('should detect tokens correctly', async () => {
		assetsDetection.configure({ networkType: MAINNET });
		sandbox
			.stub(assetsContract, 'getBalancesInSingleCall')
			.returns({ '0x6810e776880C02933D47DB1b9fc05908e5386b96': new BN(1) });
		await assetsDetection.detectTokens();
		expect(assets.state.tokens).toEqual([
			{
				address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
				decimals: 18,
				symbol: 'GNO'
			}
		]);
	});

	it('should subscribe to new sibling detecting assets when account changes', async () => {
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'mainnet';
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		const detectAssets = sandbox.stub(assetsDetection, 'detectAssets');
		preferences.update({ selectedAddress: secondAddress });
		preferences.update({ selectedAddress: secondAddress });
		expect(assetsDetection.context.PreferencesController.state.selectedAddress).toEqual(secondAddress);
		expect(detectAssets.calledTwice).toBe(false);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsDetection.context.PreferencesController.state.selectedAddress).toEqual(firstAddress);
		network.update({ provider: { type: secondNetworkType } });
		expect(assetsDetection.context.NetworkController.state.provider.type).toEqual(secondNetworkType);
		network.update({ provider: { type: firstNetworkType } });
		expect(assetsDetection.context.NetworkController.state.provider.type).toEqual(firstNetworkType);
		assets.update({ tokens: TOKENS });
		expect(assetsDetection.config.tokens).toEqual(TOKENS);
	});
});
