import { createSandbox } from 'sinon';
import AssetsDetectionController from './AssetsDetectionController';
import { NetworkController } from './NetworkController';
import { PreferencesController } from './PreferencesController';
import { ComposableController } from './ComposableController';
import { AssetsController } from './AssetsController';
const HttpProvider = require('ethjs-provider-http');

const DEFAULT_INTERVAL = 180000;
const PROVIDER = new HttpProvider('https://ropsten.infura.io');
const MAINNET_PROVIDER = new HttpProvider('https://mainnet.infura.io');

describe('AssetsDetectionController', () => {
	let assetsDetectionController: AssetsDetectionController;
	const sandbox = createSandbox();

	beforeEach(() => {
		assetsDetectionController = new AssetsDetectionController({ provider: PROVIDER });
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('should set default config', () => {
		expect(assetsDetectionController.config).toEqual({
			collectibles: [],
			interval: DEFAULT_INTERVAL,
			networkType: '',
			provider: {
				host: 'https://ropsten.infura.io',
				timeout: 0
			},
			selectedAddress: '',
			tokens: []
		});
	});

	it('should poll on correct interval', () => {
		const func = sandbox.stub(global, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new AssetsDetectionController({ interval: 1337 });
		expect(func.getCall(0).args[1]).toBe(1337);
	});

	it('should detect assets on interval when mainnet', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetectionController = new AssetsDetectionController({ networkType: 'mainnet' });
		const detectTokens = sandbox.stub(assetsDetectionController, 'detectTokens').returns(null);
		const detectCollectibles = sandbox.stub(assetsDetectionController, 'detectCollectibles').returns(null);
		clock.tick(180001);
		expect(detectTokens.called).toBe(true);
		expect(detectCollectibles.called).toBe(true);
	});

	it('should not detect assets on interval when not mainnet', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetectionController = new AssetsDetectionController({ networkType: 'rinkeby' });
		const detectTokens = sandbox.stub(assetsDetectionController, 'detectTokens').returns(null);
		const detectCollectibles = sandbox.stub(assetsDetectionController, 'detectCollectibles').returns(null);
		clock.tick(180001);
		expect(detectTokens.called).toBe(false);
		expect(detectCollectibles.called).toBe(false);
	});

	it('should d and add tokens on interval when mainnet', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetectionController = new AssetsDetectionController({ provider: PROVIDER, networkType: 'mainnet' });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		preferences.update({ selectedAddress: '0x1234' });
		assetsDetectionController.configure({ provider: PROVIDER });
		clock.tick(180001);
		expect(assets.state.tokens).toEqual([]);
		expect(assets.state.collectibles).toEqual([]);
	});

	it('should detect token accordingly on interval when mainnet', async () => {
		assetsDetectionController = new AssetsDetectionController({ provider: MAINNET_PROVIDER });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		preferences.update({ selectedAddress: '0x606af0bd4501855914b50e2672c5926b896737ef' });
		sandbox.stub(assetsDetectionController, 'contractBalanceOf').returns(1);
		await assetsDetectionController.detectTokenOwnership('0x86Fa049857E0209aa7D9e616F7eb3b3B78ECfdb0');
		expect(assets.state.tokens).toEqual([
			{ address: '0x86Fa049857E0209aa7D9e616F7eb3b3B78ECfdb0', decimals: 18, symbol: 'EOS' }
		]);
	});

	it('should detect collectible when interface supported accordingly on interval when mainnet', async () => {
		assetsDetectionController = new AssetsDetectionController({ provider: MAINNET_PROVIDER });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox.stub(assetsDetectionController, 'contractBalanceOf').returns(1);
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(true);
		preferences.update({ selectedAddress: '0x9a90bd8d1149a88b42a99cf62215ad955d6f498a' });
		await assetsDetectionController.detectCollectibleOwnership('0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab');
		expect(assets.state.collectibles.length).toEqual(1);
	});

	it('should detect collectible when interface not supported accordingly on interval when mainnet', async () => {
		jest.setTimeout(20000);
		assetsDetectionController = new AssetsDetectionController({ provider: MAINNET_PROVIDER });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox.stub(assetsDetectionController, 'contractBalanceOf').returns(1);
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(false);
		sandbox
			.stub(assetsDetectionController, 'getCollectibleUserApi' as any)
			.returns(
				'https://api.cryptokitties.co/kitties?owner_wallet_address=0xb1690C08E213a35Ed9bAb7B318DE14420FB57d8C'
			);
		await assetsDetectionController.detectCollectibleOwnership('0x06012c8cf97BEaD5deAe237070F9587f8E7A266d');
		expect(assets.state.collectibles.length).not.toEqual(0);
	});

	it('should detect collectible when interface not supported accordingly on interval when mainnet', async () => {
		jest.setTimeout(20000);
		assetsDetectionController = new AssetsDetectionController({ provider: MAINNET_PROVIDER });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox
			.stub(assetsDetectionController, 'getCollectibleUserApi' as any)
			.returns(
				'https://api.cryptokitties.co/kitties?owner_wallet_address=0xb1690C08E213a35Ed9bAb7B318DE14420FB57d8C'
			);

		await assetsDetectionController.detectCollectibleOwnership('0x06012c8cf97BEaD5deAe237070F9587f8E7A266d');
		expect(assets.state.collectibles.length).not.toEqual(0);
	});

	it('should not detect assets when no balance', async () => {
		assetsDetectionController = new AssetsDetectionController({ provider: MAINNET_PROVIDER });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		preferences.update({ selectedAddress: '0x606af0bd4501855914b50e2672c5926b896737ef' });
		sandbox.stub(assetsDetectionController, 'contractBalanceOf').returns(0);
		await assetsDetectionController.detectTokens();
		await assetsDetectionController.detectCollectibles();
		expect(assets.state.collectibles.length).toEqual(0);
		expect(assets.state.tokens.length).toEqual(0);
	});

	it('should subscribe to new sibling detecting assets when network or account changes', async () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const assets = new AssetsController();
		const firstNetworkType = 'rinkeby';
		const secondNetworkType = 'mainnet';
		const firstAddress = '0x123';
		const secondAddress = '0x321';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		const detectAssets = sandbox.stub(assetsDetectionController, 'detectAssets');
		preferences.update({ selectedAddress: secondAddress });
		preferences.update({ selectedAddress: secondAddress });
		expect(assetsDetectionController.context.PreferencesController.state.selectedAddress).toEqual(secondAddress);
		expect(detectAssets.calledTwice).toBe(false);
		preferences.update({ selectedAddress: firstAddress });
		expect(assetsDetectionController.context.PreferencesController.state.selectedAddress).toEqual(firstAddress);
		network.update({ provider: { type: secondNetworkType } });
		network.update({ provider: { type: secondNetworkType } });
		expect(assetsDetectionController.context.NetworkController.state.provider.type).toEqual(secondNetworkType);
		expect(detectAssets.calledThrice).toBe(true);
		network.update({ provider: { type: firstNetworkType } });
		expect(assetsDetectionController.context.NetworkController.state.provider.type).toEqual(firstNetworkType);
	});
});
