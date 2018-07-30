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

	/**
	 * Retrieves the underlying datamodel state
	 *
	 * @returns - Current state
	 */
	getState() {
		return this.datamodel.flatState;
	}

	/**
	 * Sets a new active currency and fetches its exchange rate
	 *
	 * @param currency - ISO 4217 currency code
	 * @returns - Promise resolving to exchange rate for given currecy
	 */
	setCurrentCurrency(currency: string) {
		return this.api.currencyRate.updateCurrency(currency);
	}

	/**
	 * Calculates lowest gas price that would've been included in 50% of recent blocks
	 *
	 * @returns - Optimal gas price based on recent blocks
	 */
	getGasPrice() {
		return getGasPrice(this.api.blockHistory.state.recentBlocks);
	}

	/**
	 * Return a URL that can be used to obtain ETH for the current network
	 *
	 * @param address - Address to deposit obtained ETH
	 * @param amount - How much ETH is desired
	 * @returns - URL to buy ETH based on network
	 */
	getBuyEthUrl(address: string, amount: number) {
		return getBuyURL(this.api.network.state.network, address, amount);
	}

	/**
	 * Creates a new ShapeShift transaction
	 *
	 * @param depositAddress - Address where coins should be deposited
	 * @param depositType - Abbreviation of the type of crypto currency to be deposited
	 */
	createShapeShiftTx(depositAddress: string, depositType: string) {
		return this.api.shapeShift.createTransaction(depositAddress, depositType);
	}

	/**
	 * Updates the currently-active address
	 *
	 * @param selectedAddress - New address to set as active
	 */
	setSelectedAddress(selectedAddress: string) {
		return this.api.preferences.update({ selectedAddress });
	}

	/**
	 * Adds a token to the stored token list
	 *
	 * @param address - Hex address of the token contract
	 * @param symbol - Symbol of the token
	 * @param decimals - Number of decimals the token uses
	 * @returns - Current token list
	 */
	addToken(address: string, symbol: string, decimals: number) {
		return this.api.preferences.addToken(address, symbol, decimals);
	}

	/**
	 * Removes a token from the stored token list
	 *
	 * @param address - Hex address of the token contract
	 */
	removeToken(address: string) {
		return this.api.preferences.removeToken(address);
	}

	/**
	 * Associates a new label with an identity
	 *
	 * @param address - Address of the identity to associate
	 * @param label - New label to assign
	 */
	setAccountLabel(address: string, label: string) {
		return this.api.preferences.setAccountLabel(address, label);
	}

	/**
	 * Removes a token from the stored token list
	 *
	 * @param address - Hex address of the token contract
	 */
	setFeatureFlag(feature: string, flag: boolean) {
		return this.api.preferences.setFeatureFlag(feature, flag);
	}

	/**
	 * Convenience method to update provider network type settings
	 *
	 * @param type - Human readable network name
	 */
	setProviderType(type: NetworkType) {
		return this.api.network.setProviderType(type);
	}

	/**
	 * Convenience method to update provider RPC settings
	 *
	 * @param rpcTarget - RPC endpoint URL
	 */
	setCustomRpc(rpcTarget: string) {
		return this.api.network.setRpcTarget(rpcTarget);
	}

	/**
	 * Add or update a contact entry by address
	 *
	 * @param address - Recipient address to add or update
	 * @param name - Nickname to associate with this address
	 */
	setAddressBook(address: string, name: string) {
		return this.api.addressBook.set(address, name);
	}

	/**
	 * Deallocates all secrets and locks the wallet
	 *
	 * @returns - Promise resolving to current state
	 */
	setLocked() {
		return this.api.keyring.setLocked();
	}

	/**
	 * Gets the private key from the keyring controlling an address
	 *
	 * @param address - Address to export
	 * @returns - Promise resolving to the private key for an address
	 */
	exportAccount(address: string) {
		return this.api.keyring.exportAccount(address);
	}

	/**
	 * Create a new primary keychain and wipe any previous keychains
	 *
	 * @param password - Password to unlock the new vault
	 * @returns - Newly-created keychain object
	 */
	createNewVaultAndKeychain(password: string) {
		return this.api.keyring.createNewVaultAndKeychain(password);
	}

	/**
	 * Effectively the same as creating a new keychain then populating it
	 * using the given seed phrase
	 *
	 * @param password - Password to unlock keychain
	 * @param seed - Seed phrase to restore keychain
	 * @returns - Promise resolving to th restored keychain object
	 */
	createNewVaultAndRestore(password: string, seed: string) {
		return this.api.keyring.createNewVaultAndRestore(password, seed);
	}

	/**
	 * Attempts to decrypt the current vault and load its keyrings
	 *
	 * @param password - Password to unlock the keychain
	 * @returns - Promise resolving to the current state
	 */
	submitPassword(password: string) {
		return this.api.keyring.submitPassword(password);
	}

	/**
	 * Adds a new account to the default (first) HD seed phrase keyring
	 *
	 * @returns - Promise resolving when the account is added
	 */
	addNewAccount() {
		return this.api.keyring.addNewAccount();
	}

	/**
	 * Removes an account from keyring state
	 *
	 * @param address - Address of the account to remove
	 * @returns - Promise resolving when this account removal completes
	 */
	removeAccount(address: string) {
		return this.api.keyring.removeAccount(address);
	}

	/**
	 * Verifies the that the seed phrase restores the current keychain's accounts
	 *
	 * @returns - Promise resolving if the verification succeeds
	 */
	verifySeedPhrase() {
		return this.api.keyring.verifySeedPhrase();
	}

	/**
	 * Imports an account with the specified import strategy
	 *
	 * @param strategy - Import strategy name
	 * @param args - Array of arguments to pass to the underlying stategy
	 * @returns - Promise resolving when the import is complete
	 */
	importAccountWithStrategy(strategy: string, args: any) {
		return this.api.keyring.importAccountWithStrategy(strategy, args);
	}
}

export default CoreController;
