import {
	AccountTrackerController,
	AddressBookController,
	BaseConfig,
	BaseController,
	BaseState,
	BlockHistoryController,
	ComposableController,
	CurrencyRateController,
	KeyringController,
	NetworkController,
	NetworkStatusController,
	NetworkType,
	PhishingController,
	PreferencesController,
	ShapeShiftController,
	TokenRatesController
} from '.';
import { getBuyURL, getGasPrice } from './util';

const BlockTracker = require('eth-block-tracker');

/**
 * Core controller responsible for composing other child controllers together
 * and exposing convenience methods for common wallet operations.
 */
export class CoreController extends BaseController<BaseState, BaseConfig> {
	private initializeBlockTracker() {
		const {
			accountTracker,
			blockHistory,
			network: { provider }
		} = this.api;
		provider.sendAsync = provider.sendAsync.bind(provider);
		const blockTracker = new BlockTracker({ provider });
		blockHistory.configure({ provider, blockTracker });
		accountTracker.configure({ provider, blockTracker });
		blockTracker.start();
	}

	/**
	 * Child controller instances keyed by controller name
	 */
	api = {
		accountTracker: new AccountTrackerController(),
		addressBook: new AddressBookController(),
		blockHistory: new BlockHistoryController(),
		currencyRate: new CurrencyRateController(),
		keyring: new KeyringController(),
		network: new NetworkController(undefined, {
			providerConfig: {
				/* todo */
			}
		}),
		networkStatus: new NetworkStatusController(),
		phishing: new PhishingController(),
		preferences: new PreferencesController(),
		shapeShift: new ShapeShiftController(),
		tokenRates: new TokenRatesController()
	};

	/**
	 * ComposableController reference containing all child controllers
	 */
	datamodel: ComposableController;

	/**
	 * Creates a CoreController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<BaseState>, config?: Partial<BaseConfig>) {
		super(state, config);
		this.datamodel = new ComposableController(this.api);
		this.initializeBlockTracker();
		this.initialize();
	}

	getState() {
		return this.datamodel.flatState;
	}

	setCurrentCurrency(currency: string) {
		return this.api.currencyRate.updateCurrency(currency);
	}

	getGasPrice() {
		return getGasPrice(this.api.blockHistory.state.recentBlocks);
	}

	getBuyEthUrl(address: string, amount: number) {
		return getBuyURL(this.api.network.state.network, address, amount);
	}

	createShapeShiftTx(depositAddress: string, depositType: string) {
		return this.api.shapeShift.createTransaction(depositAddress, depositType);
	}

	setSelectedAddress(selectedAddress: string) {
		return this.api.preferences.update({ selectedAddress });
	}

	addToken(address: string, symbol: string, decimals: number) {
		return this.api.preferences.addToken(address, symbol, decimals);
	}

	removeToken(address: string) {
		return this.api.preferences.removeToken(address);
	}

	setAccountLabel(address: string, label: string) {
		return this.api.preferences.setAccountLabel(address, label);
	}

	setFeatureFlag(feature: string, flag: boolean) {
		return this.api.preferences.setFeatureFlag(feature, flag);
	}

	setProviderType(type: NetworkType) {
		return this.api.network.setProviderType(type);
	}

	setCustomRpc(rpcTarget: string) {
		return this.api.network.setRpcTarget(rpcTarget);
	}

	setAddressBook(address: string, name: string) {
		return this.api.addressBook.set(address, name);
	}

	setLocked() {
		return this.api.keyring.setLocked();
	}

	exportAccount(address: string) {
		return this.api.keyring.exportAccount(address);
	}

	createNewVaultAndKeychain(password: string) {
		return this.api.keyring.createNewVaultAndKeychain(password);
	}

	createNewVaultAndRestore(password: string, seed: string) {
		return this.api.keyring.createNewVaultAndRestore(password, seed);
	}

	submitPassword(password: string) {
		return this.api.keyring.submitPassword(password);
	}

	addNewAccount() {
		return this.api.keyring.addNewAccount();
	}

	removeAccount(address: string) {
		return this.api.keyring.removeAccount(address);
	}

	verifySeedPhrase() {
		return this.api.keyring.verifySeedPhrase();
	}

	importAccountWithStrategy(strategy: string, args: any) {
		return this.api.keyring.importAccountWithStrategy(strategy, args);
	}
}

export default CoreController;
