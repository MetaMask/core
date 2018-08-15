import 'isomorphic-fetch';
import AccountTrackerController from './AccountTrackerController';
import BaseController, { BaseConfig, BaseState, Listener } from './BaseController';
import PreferencesController from './PreferencesController';
import { Transaction } from './TransactionController';

const Keyring = require('eth-keyring-controller');
const Mutex = require('await-semaphore').Mutex;
const Wallet = require('ethereumjs-wallet');
const ethUtil = require('ethereumjs-util');
const importers = require('ethereumjs-wallet/thirdparty');

/**
 * Available keyring types
 */
export enum KeyringTypes {
	simple = 'Simple Key Pair',
	hd = 'HD Key Tree'
}

/**
 * @type KeyringState
 *
 * Keyring controller state
 *
 * @property isUnlocked - Determines if this keyring is unlocked
 * @property keyringTypes - List of available keyring types
 * @property keyrings - List of keyrings
 */
export interface KeyringState extends BaseState {
	isUnlocked: boolean;
	keyringTypes: KeyringTypes[];
	keyrings: any[];
}

/**
 * Controller resposible for establishing and managing user identity
 */
export class KeyringController extends BaseController<KeyringState, BaseConfig> {
	private keyring: any;
	private mutex = new Mutex();

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['AccountTrackerController', 'PreferencesController'];

	/**
	 * Creates a KeyringController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<KeyringState>, config?: Partial<BaseConfig>) {
		super(state, config);
		this.defaultState = {
			isUnlocked: false,
			keyringTypes: [KeyringTypes.simple, KeyringTypes.hd],
			keyrings: []
		};
		this.keyring = new Keyring({ ...{ initState: state }, ...config });
		this.initialize();
	}

	/**
	 * Retrieves keyring's state
	 *
	 * @returns - Current state
	 */
	get state(): KeyringState {
		return this.keyring.memStore.getState();
	}

	/**
	 * Adds a new account to the default (first) HD seed phrase keyring
	 *
	 * @returns - Promise resolving when the account is added
	 */
	async addNewAccount() {
		const preferences = this.context.PreferencesController as PreferencesController;
		const primaryKeyring = this.keyring.getKeyringsByType('HD Key Tree')[0];
		if (!primaryKeyring) {
			throw new Error('No HD keyring found');
		}
		const oldAccounts = await this.keyring.getAccounts();
		await this.keyring.addNewAccount(primaryKeyring);
		const newAccounts = await this.keyring.getAccounts();

		await this.verifySeedPhrase();

		preferences.updateIdentities(newAccounts);
		newAccounts.forEach((selectedAddress: string) => {
			if (!oldAccounts.includes(selectedAddress)) {
				preferences.update({ selectedAddress });
			}
		});
	}

	/**
	 * Effectively the same as creating a new keychain then populating it
	 * using the given seed phrase
	 *
	 * @param password - Password to unlock keychain
	 * @param seed - Seed phrase to restore keychain
	 * @returns - Promise resolving to th restored keychain object
	 */
	async createNewVaultAndRestore(password: string, seed: string) {
		const preferences = this.context.PreferencesController as PreferencesController;
		const releaseLock = await this.mutex.acquire();
		try {
			preferences.updateIdentities([]);
			const vault = await this.keyring.createNewVaultAndRestore(password, seed);
			preferences.updateIdentities(await this.keyring.getAccounts());
			preferences.update({ selectedAddress: Object.keys(preferences.state.identities)[0] });
			releaseLock();
			return vault;
		} catch (err) {
			releaseLock();
			throw err;
		}
	}

	/**
	 * Create a new primary keychain and wipe any previous keychains
	 *
	 * @param password - Password to unlock the new vault
	 * @returns - Newly-created keychain object
	 */
	async createNewVaultAndKeychain(password: string) {
		const preferences = this.context.PreferencesController as PreferencesController;
		const releaseLock = await this.mutex.acquire();
		try {
			let vault;
			const accounts = await this.keyring.getAccounts();
			if (accounts.length > 0) {
				vault = await this.keyring.fullUpdate();
			} else {
				vault = await this.keyring.createNewVaultAndKeychain(password);
				preferences.updateIdentities(await this.keyring.getAccounts());
				preferences.update({ selectedAddress: Object.keys(preferences.state.identities)[0] });
			}
			releaseLock();
			return vault;
		} catch (err) {
			releaseLock();
			throw err;
		}
	}

	/**
	 * Gets the private key from the keyring controlling an address
	 *
	 * @param address - Address to export
	 * @returns - Promise resolving to the private key for an address
	 */
	exportAccount(address: string): Promise<string> {
		return this.keyring.exportAccount(address);
	}

	/**
	 * Returns the public addresses of all accounts for the current keyring
	 *
	 * @returns - A promise resolving to an array of addresses
	 */
	getAccounts(): Promise<string> {
		return this.keyring.getAccounts;
	}

	/**
	 * Imports an account with the specified import strategy
	 *
	 * @param strategy - Import strategy name
	 * @param args - Array of arguments to pass to the underlying stategy
	 * @returns - Promise resolving when the import is complete
	 */
	async importAccountWithStrategy(strategy: string, args: any[]) {
		let privateKey;
		const preferences = this.context.PreferencesController as PreferencesController;
		switch (strategy) {
			case 'privateKey':
				const [importedKey] = args;
				if (!importedKey) {
					throw new Error('Cannot import an empty key.');
				}
				const prefixed = ethUtil.addHexPrefix(importedKey);
				if (!ethUtil.isValidPrivate(ethUtil.toBuffer(prefixed))) {
					throw new Error('Cannot import invalid private key.');
				}
				privateKey = ethUtil.stripHexPrefix(prefixed);
				break;
			case 'json':
				let wallet;
				const [input, password] = args;
				try {
					wallet = importers.fromEtherWallet(input, password);
				} catch (e) {
					wallet = wallet || Wallet.fromV3(input, password, true);
				}
				privateKey = ethUtil.bufferToHex(wallet.getPrivateKey());
				break;
		}
		const newKeyring = await this.keyring.addNewKeyring(KeyringTypes.simple, [privateKey]);
		const accounts = await newKeyring.getAccounts();
		const allAccounts = await this.keyring.getAccounts();
		preferences.updateIdentities(allAccounts);
		preferences.update({ selectedAddress: accounts[0] });
	}

	/**
	 * Removes an account from keyring state
	 *
	 * @param address - Address of the account to remove
	 * @returns - Promise resolving when this account removal completes
	 */
	async removeAccount(address: string) {
		const preferences = this.context.PreferencesController as PreferencesController;
		const accountTracker = this.context.AccountTrackerController as AccountTrackerController;
		preferences.removeIdentity(address);
		accountTracker.remove(address);
		await this.keyring.removeAccount(address);
	}

	/**
	 * Deallocates all secrets and locks the wallet
	 *
	 * @returns - Promise resolving to current state
	 */
	setLocked(): Promise<KeyringState> {
		return this.keyring.setLocked();
	}

	/**
	 * Signs a transaction by calling down into a specific keyring
	 *
	 * @param transaction - Transaction object to sign
	 * @param from - Address to sign from, should be in keychain
	 * @returns - Promise resolving to a signed transaction string
	 */
	signTransaction(transaction: Transaction, from: string) {
		return this.keyring.signTransaction(transaction, from);
	}

	/**
	 * Attempts to decrypt the current vault and load its keyrings
	 *
	 * @param password - Password to unlock the keychain
	 * @returns - Promise resolving to the current state
	 */
	async submitPassword(password: string) {
		const preferences = this.context.PreferencesController as PreferencesController;
		await this.keyring.submitPassword(password);
		const accounts = await this.keyring.getAccounts();
		await preferences.syncIdentities(accounts);
		return this.keyring.fullUpdate();
	}

	/**
	 * Adds new listener to be notified of state changes
	 *
	 * @param listener - Callback triggered when state changes
	 */
	subscribe(listener: Listener<KeyringState>) {
		this.keyring.memStore.subscribe(listener);
	}

	/**
	 * Removes existing listener from receiving state changes
	 *
	 * @param listener - Callback to remove
	 * @returns - True if a listener is found and unsubscribed
	 */
	unsubscribe(listener: Listener<KeyringState>) {
		return this.keyring.memStore.unsubscribe(listener);
	}

	/**
	 * Verifies the that the seed phrase restores the current keychain's accounts
	 *
	 * @returns - Promise resolving if the verification succeeds
	 */
	async verifySeedPhrase() {
		const primaryKeyring = this.keyring.getKeyringsByType(KeyringTypes.hd)[0];
		if (!primaryKeyring) {
			throw new Error('No HD keyring found.');
		}

		const seedWords = (await primaryKeyring.serialize()).mnemonic;
		const accounts = await primaryKeyring.getAccounts();
		if (accounts.length === 0) {
			throw new Error('Cannot verify an empty keyring.');
		}

		const TestKeyringClass = this.keyring.getKeyringClassForType(KeyringTypes.hd);
		const testKeyring = new TestKeyringClass({ mnemonic: seedWords, numberOfAccounts: accounts.length });
		const testAccounts = await testKeyring.getAccounts();
		if (testAccounts.length !== accounts.length) {
			throw new Error('Seed phrase imported incorrect number of accounts.');
		}

		testAccounts.forEach((account: string, i: number) => {
			if (account.toLowerCase() !== accounts[i].toLowerCase()) {
				throw new Error('Seed phrase imported different accounts.');
			}
		});

		return seedWords;
	}
}

export default KeyringController;
