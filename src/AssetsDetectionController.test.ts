import { createSandbox } from 'sinon';
import { getOnce } from 'fetch-mock';
import { AssetsDetectionController } from './AssetsDetectionController';
import { NetworkController } from './NetworkController';
import { PreferencesController } from './PreferencesController';
import { ComposableController } from './ComposableController';
import { AssetsController } from './AssetsController';
import { AssetsContractController } from './AssetsContractController';

const BN = require('ethereumjs-util').BN;
const HttpProvider = require('ethjs-provider-http');
const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const MAINNET_PROVIDER = new HttpProvider('https://mainnet.infura.io');
const GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const CKADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
const TOKENS = [{ address: '0xfoO', symbol: 'bar', decimals: 2 }];

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
		const detectCollectibleOwnership = sandbox.stub(assetsDetection, 'detectCollectibleOwnership').returns(null);
		clock.tick(180001);
		expect(detectCollectibleOwnership.called).toBe(true);
		expect(detectTokens.called).toBe(true);
	});

	it('should be able to detectTokenOwnership correctly', async () => {
		assetsDetection.configure({ networkType: MAINNET });
		sandbox
			.stub(assetsContract, 'getBalanceOf')
			.withArgs('0x')
			.returns(new BN(0))
			.withArgs('0x6810e776880C02933D47DB1b9fc05908e5386b96')
			.returns(new BN(1));

		await assetsDetection.detectTokenOwnership('0x');
		expect(assets.state.tokens).toEqual([]);

		await assetsDetection.detectTokenOwnership('0x6810e776880C02933D47DB1b9fc05908e5386b96');
		expect(assets.state.tokens).toEqual([
			{
				address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
				decimals: 18,
				symbol: 'GNO'
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

	it('should detect enumerable collectibles correctly', async () => {
		assetsDetection.configure({
			networkType: MAINNET,
			selectedAddress: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d'
		});
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		getOnce('https://api.godsunchained.com/card/0', () => ({
			body: JSON.stringify({ image: 'https://api.godsunchained.com/v0/image/380', name: 'First Pheonix' })
		}));
		sandbox.stub(assetsContract, 'getBalanceOf').returns(new Promise((resolve) => resolve(new BN(2))));
		sandbox.stub(assetsContract, 'getCollectibleTokenId').returns(new Promise((resolve) => resolve(0)));
		await assetsDetection.detectCollectibleOwnership(GODSADDRESS);
		expect(assets.state.collectibles).toEqual([
			{
				address: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
				image: 'https://api.godsunchained.com/v0/image/380',
				name: 'First Pheonix',
				tokenId: 0
			}
		]);
	});

	it('should detect not enumerable collectibles correctly', async () => {
		getOnce(
			'https://api.cryptokitties.co/kitties?owner_wallet_address=0xb161330dc0d6a9e1cb441b3f2593ba689136b4e4',
			() => ({
				body: JSON.stringify({ offset: 0, limit: 12, kitties: [{ id: 411073 }] })
			})
		);
		getOnce('https://api.cryptokitties.co/kitties/411073', () => ({
			body: JSON.stringify({
				id: 411073,
				image_url: 'https://img.cryptokitties.co/0x06012c8cf97bead5deae237070f9587f8e7a266d/411073.svg',
				name: 'TestName'
			})
		}));
		assetsDetection.configure({
			networkType: MAINNET,
			selectedAddress: '0xb161330dc0d6a9e1cb441b3f2593ba689136b4e4'
		});
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		sandbox.stub(assetsContract, 'getBalanceOf').returns(new BN(1));
		await assetsDetection.detectCollectibleOwnership(CKADDRESS);
		expect(assets.state.collectibles).toEqual([
			{
				address: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
				image: 'https://img.cryptokitties.co/0x06012c8cf97bead5deae237070f9587f8e7a266d/411073.svg',
				name: 'TestName',
				tokenId: 411073
			}
		]);
	});

	it('should not detect asset ownership when no balance of', async () => {
		assetsDetection.configure({
			networkType: MAINNET,
			selectedAddress: '0xb1690C08E213a35Ed9bAb7B318DE14420FB57d8C'
		});
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		sandbox.stub(assetsContract, 'getBalanceOf').returns(new BN(0));
		const contractSupportsEnumerableInterface = sandbox
			.stub(assetsContract, 'contractSupportsEnumerableInterface')
			.returns(false);
		const addToken = sandbox.stub(assets, 'addToken');
		await assetsDetection.detectCollectibleOwnership(GODSADDRESS);
		expect(contractSupportsEnumerableInterface.called).toBe(false);
		expect(addToken.called).toBe(false);
	});

	it('should not detect asset ownership when address not in contract metadata', async () => {
		assetsDetection.configure({ networkType: MAINNET });
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		sandbox.stub(assetsContract, 'getBalanceOf').returns(new BN(1));
		const getEnumerableCollectiblesIds = sandbox
			.stub(assetsDetection, 'getEnumerableCollectiblesIds' as any)
			.returns(false);
		const getApiCollectiblesIds = sandbox.stub(assetsDetection, 'getApiCollectiblesIds' as any).returns(false);
		await assetsDetection.detectCollectibleOwnership('0xb1690C08E213a35Ed9bAb7B318DE14420FB57d8C');
		expect(getEnumerableCollectiblesIds.called).toBe(false);
		expect(getApiCollectiblesIds.called).toBe(false);
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
