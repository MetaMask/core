import { createSandbox, stub } from 'sinon';
import ComposableController from './ComposableController';
import TokenBalancesController from './TokenBalancesController';
import { AssetsController } from './AssetsController';
import { Token } from './TokenRatesController';
import { AssetsContractController } from './AssetsContractController';
import { NetworkController } from './NetworkController';
import { PreferencesController } from './PreferencesController';

const { BN } = require('ethereumjs-util');
const HttpProvider = require('ethjs-provider-http');
const MAINNET_PROVIDER = new HttpProvider('https://mainnet.infura.io');

describe('TokenBalancesController', () => {
	let tokenBalances: TokenBalancesController;
	const sandbox = createSandbox();

	beforeEach(() => {
		tokenBalances = new TokenBalancesController();
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('should set default state', () => {
		expect(tokenBalances.state).toEqual({ contractBalances: {} });
	});

	it('should set default config', () => {
		expect(tokenBalances.config).toEqual({
			interval: 180000,
			tokens: []
		});
	});

	it('should poll on correct interval', () => {
		const func = sandbox.stub(global, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new TokenBalancesController({ interval: 1337 });
		expect(func.getCall(0).args[1]).toBe(1337);
		func.restore();
	});

	it('should update balances on interval', () => {
		const clock = sandbox.useFakeTimers();
		tokenBalances.configure({ interval: 180000 });
		const updateBalances = sandbox.stub(tokenBalances, 'updateBalances');
		clock.tick(180001);
		expect(updateBalances.called).toBe(true);
	});

	it('should update all balances', async () => {
		const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
		expect(tokenBalances.state.contractBalances).toEqual({});
		tokenBalances.configure({ tokens: [{ address, decimals: 18, symbol: 'EOS' }] });
		const assets = new AssetsController();
		const assetsContract = new AssetsContractController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsContract, network, preferences, tokenBalances]);
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		stub(assetsContract, 'getBalanceOf').returns(new BN(1));
		await tokenBalances.updateBalances();
		expect(Object.keys(tokenBalances.state.contractBalances)).toContain(address);
		expect(tokenBalances.state.contractBalances[address].toNumber()).toBeGreaterThan(0);
	});

	it('should not update balances if disabled', async () => {
		tokenBalances.disabled = true;
		const assets = new AssetsController();
		const assetsContract = new AssetsContractController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsContract, network, preferences, tokenBalances]);
		assetsContract.configure({ provider: MAINNET_PROVIDER });
		const getBalanceOf = sandbox.stub(assetsContract, 'getBalanceOf');
		await tokenBalances.updateBalances();
		expect(getBalanceOf.called).toBe(false);
	});

	it('should clear previous interval', () => {
		const func = sandbox.stub(global, 'clearInterval');
		const controller = new TokenBalancesController({ interval: 1337 });
		controller.interval = 1338;
		expect(func.called).toBe(true);
		func.restore();
	});

	it('should subscribe to new sibling assets controllers', async () => {
		const assets = new AssetsController();
		const assetsContract = new AssetsContractController();
		const network = new NetworkController();
		const preferences = new PreferencesController();
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([assets, assetsContract, network, preferences, tokenBalances]);
		const updateBalances = sandbox.stub(tokenBalances, 'updateBalances');
		assets.addToken('0xfoO', 'FOO', 18);
		const tokens = tokenBalances.context.AssetsController.state.tokens;
		const found = tokens.filter((token: Token) => token.address === '0xfoO');
		expect(found.length > 0).toBe(true);
		expect(updateBalances.called).toBe(true);
	});
});
