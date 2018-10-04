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
const GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const CKADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';

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
		assetsDetectionController.configure({ networkType: 'rinkeby' });
		const detectTokens = sandbox.stub(assetsDetectionController, 'detectTokens').returns(null);
		const detectCollectibles = sandbox.stub(assetsDetectionController, 'detectCollectibles').returns(null);
		clock.tick(180001);
		expect(detectTokens.called).toBe(false);
		expect(detectCollectibles.called).toBe(false);
	});

	it('should detect and add tokens on interval when mainnet', () => {
		const clock = sandbox.useFakeTimers();
		assetsDetectionController.configure({ selectedAddress: '0x1234' });
		assetsDetectionController.configure({ provider: PROVIDER, networkType: 'mainnet' });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		clock.tick(180001);
		expect(assets.state.tokens).toEqual([]);
		expect(assets.state.collectibles).toEqual([]);
	});

	it('should detect token accordingly on interval when mainnet', async () => {
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER });
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

	it('should identify when an interface is supported by collectible contract', async () => {
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER });
		const getAccountEnumerableCollectiblesIds = sandbox
			.stub(assetsDetectionController, 'getAccountEnumerableCollectiblesIds' as any)
			.returns([]);
		const getAccountApiCollectiblesIds = sandbox
			.stub(assetsDetectionController, 'getAccountApiCollectiblesIds' as any)
			.returns([]);
		await assetsDetectionController.detectCollectibleOwnership(CKADDRESS);
		expect(getAccountApiCollectiblesIds.called).toBe(true);
		expect(getAccountEnumerableCollectiblesIds.called).toBe(false);
		await assetsDetectionController.detectCollectibleOwnership(GODSADDRESS);
		expect(getAccountApiCollectiblesIds.calledTwice).toBe(false);
		expect(getAccountEnumerableCollectiblesIds.called).toBe(true);
	});

	it('should identify when there is balance in contract', async () => {
		const notHolder = '0x1234';
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER, selectedAddress: notHolder });
		const GODSAddress = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
		const balance = await assetsDetectionController.contractBalanceOf(GODSAddress);
		expect(balance).toBe(0);
	});

	it('should detect and add tokens', async () => {
		const notHolder = '0xfoo';
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER, selectedAddress: notHolder });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		const OMGAddress = '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07';
		sandbox
			.stub(assetsDetectionController, 'contractBalanceOf')
			.returns(0)
			.withArgs(OMGAddress)
			.returns(1);
		await assetsDetectionController.detectTokens();
		expect(assetsDetectionController.config.tokens).toEqual([
			{ address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07', symbol: 'OMG', decimals: 18 }
		]);
	});

	it('should detect and add collectible from contract metadata api', async () => {
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox
			.stub(assetsDetectionController, 'contractBalanceOf')
			.returns(0)
			.withArgs(CKADDRESS)
			.returns(1);
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(false);
		sandbox
			.stub(assetsDetectionController, 'getAccountApiCollectiblesIds' as any)
			.withArgs(CKADDRESS)
			.returns([{ id: 111 }]);
		await assetsDetectionController.detectCollectibles();
		expect(assetsDetectionController.config.collectibles).toEqual([
			{
				address: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
				image: 'https://img.cryptokitties.co/0x06012c8cf97bead5deae237070f9587f8e7a266d/111.png',
				name: 'Reachy',
				tokenId: 111
			}
		]);
	});

	it('should detect and add collectible from contract interaction', async () => {
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox
			.stub(assetsDetectionController, 'contractBalanceOf')
			.returns(0)
			.withArgs(GODSADDRESS)
			.returns(1);
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(true);
		sandbox
			.stub(assetsDetectionController, 'getAccountEnumerableCollectiblesIds' as any)
			.withArgs(GODSADDRESS)
			.returns([{ id: 111 }]);
		await assetsDetectionController.detectCollectibles();
		expect(assetsDetectionController.config.collectibles).toEqual([
			{
				address: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
				image: 'https://api.godsunchained.com/v0/image/355?format=card&quality=diamond',
				name: 'Eager Gryphon',
				tokenId: 111
			}
		]);
	});

	it('should get token uri correctly', async () => {
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER });
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(true);
		const tokenURI = await assetsDetectionController.getCollectibleTokenURI(GODSADDRESS, 111);
		expect(tokenURI).toBe('https://api.godsunchained.com/card/111');
	});

	it('should get correct token ids if contract supports enumerable interface', async () => {
		const holder = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER, selectedAddress: holder });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(true);
		sandbox.stub(assetsDetectionController, 'contractBalanceOf').returns(1);
		await assetsDetectionController.detectCollectibleOwnership(GODSADDRESS);
		expect(assetsDetectionController.config.collectibles).toEqual([
			{
				address: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
				image: 'https://api.godsunchained.com/v0/image/380?format=card&quality=plain',
				name: 'First Pheonix',
				tokenId: 0
			}
		]);
	});

	it('should not get token ids if contract supports enumerable interface with no balance', async () => {
		const holder = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER, selectedAddress: holder });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(true);
		sandbox.stub(assetsDetectionController, 'contractBalanceOf').returns(0);
		const getCollectibleTokenId = sandbox.stub(assetsDetectionController, 'getCollectibleTokenId' as any);
		await assetsDetectionController.detectCollectibleOwnership(GODSADDRESS);
		expect(assetsDetectionController.config.collectibles).toEqual([]);
		expect(getCollectibleTokenId.called).toBe(false);
	});

	it('should get correct token ids if contract does not support enumerable interface', async () => {
		const holder = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER, selectedAddress: holder });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		sandbox.stub(assets, 'fetchCollectibleBasicInformation' as any).returns({ name: '', image: '' });
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox.stub(assetsDetectionController, 'contractBalanceOf').returns(1);
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(false);
		await assetsDetectionController.detectCollectibleOwnership(CKADDRESS);
		expect(assetsDetectionController.config.collectibles).not.toBe([]);
	});

	it('should not get correct token ids if contract does not support enumerable interface with no balance', async () => {
		const holder = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
		assetsDetectionController.configure({ provider: MAINNET_PROVIDER, selectedAddress: holder });
		const assets = new AssetsController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		sandbox.stub(assets, 'fetchCollectibleBasicInformation' as any).returns({ name: '', image: '' });
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsDetectionController, network, preferences]);
		sandbox.stub(assetsDetectionController, 'contractBalanceOf').returns(0);
		sandbox.stub(assetsDetectionController, 'contractSupportsInterface' as any).returns(false);
		const getCollectibleUserApi = sandbox.stub(assetsDetectionController, 'getCollectibleUserApi' as any);
		await assetsDetectionController.detectCollectibleOwnership(CKADDRESS);
		expect(assetsDetectionController.config.collectibles).toEqual([]);
		expect(getCollectibleUserApi.called).toBe(false);
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
