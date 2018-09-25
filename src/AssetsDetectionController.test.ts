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
const TOKENS = [{ address: '0xfoO', symbol: 'bar', decimals: 2 }];
const COLLECTIBLES = [{ address: '0xfoO', image: 'url', name: 'name', tokenId: 1234 }];

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

	it('should  and add tokens on interval when mainnet', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetectionController = new AssetsDetectionController({ provider: PROVIDER, networkType: 'mainnet' });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		preferences.update({ selectedAddress: '0xde01e52811baa6a4a23a9634179ebe8f77b6d89b' });
		assetsDetectionController.configure({ provider: PROVIDER });
		assetsDetectionController.detectTokenBalance('0x0D262e5dC4A06a0F1c90cE79C7a60C09DfC884E4');
		const detectCollectibles = sandbox.stub(assetsDetectionController, 'detectCollectibles');
		clock.tick(180001);
		expect(assets.state.tokens).toEqual([]);
		expect(detectCollectibles.called).toBe(true);
	});

	it('should detect and add tokens on interval when mainnet', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetectionController = new AssetsDetectionController({
			networkType: 'mainnet',
			provider: MAINNET_PROVIDER
		});
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox
			.stub(assetsDetectionController, 'detectTokenBalance')
			.withArgs('0x0D262e5dC4A06a0F1c90cE79C7a60C09DfC884E4')
			.returns(assets.addToken('0xfoO', 'bar', 2));
		const detectCollectibles = sandbox.stub(assetsDetectionController, 'detectCollectibles');
		clock.tick(180001);
		expect(assets.state.tokens).toEqual(TOKENS);
		expect(detectCollectibles.called).toBe(true);
	});

	it('should detect respond accordingly on interval when mainnet', async () => {
		assetsDetectionController = new AssetsDetectionController({ provider: MAINNET_PROVIDER });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		preferences.update({ selectedAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf' });
		await assetsDetectionController.detectTokenBalance('0x86Fa049857E0209aa7D9e616F7eb3b3B78ECfdb0');
		expect(assets.state.tokens).toEqual([
			{
				address: '0x86Fa049857E0209aa7D9e616F7eb3b3B78ECfdb0',
				decimals: 18,
				symbol: 'EOS'
			}
		]);
	});

	it('should subscribe to new sibling preference controllers', async () => {
		const preferences = new PreferencesController();
		const network = new NetworkController();
		const assets = new AssetsController();
		const networkType = 'rinkeby';
		const address = '0x123';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox.stub(assets, 'requestNFTCustomInformation' as any).returns({ name: 'name', image: 'url' });
		preferences.update({ selectedAddress: address });
		expect(assetsDetectionController.context.PreferencesController.state.selectedAddress).toEqual(address);
		network.update({ provider: { type: networkType } });
		expect(assetsDetectionController.context.NetworkController.state.provider.type).toEqual(networkType);
		assets.addToken('0xfoO', 'bar', 2);
		expect(assetsDetectionController.context.AssetsController.state.tokens).toEqual(TOKENS);
		await assets.addCollectible('foo', 1234);
		expect(assetsDetectionController.context.AssetsController.state.collectibles).toEqual(COLLECTIBLES);
	});
});
