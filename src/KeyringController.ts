import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState, Listener } from './BaseController';
import PreferencesController from './PreferencesController';
import { Transaction } from './TransactionController';
import { MessageParams } from './PersonalMessageManager';

const { toChecksumAddress } = require('ethereumjs-util');
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
 * @type KeyringObject
 *
 * Keyring object
 *
 * @property type - Keyring type
 * @property accounts - Associated accounts
 * @function getAccounts - Get associated accounts
 */
export interface KeyringObject {
	type: string;
	accounts: string[];
	getAccounts(): string[];
}

/**
 * @type KeyringState
 *
 * Keyring controller state
 *
 * @property vault - Encrypted string representing keyring data
 * @property keyrings - Group of accounts
 */
export interface KeyringState extends BaseState {
	vault?: string;
	keyrings: object;
}

/**
 * Controller resposible for establishing and managing user identity
 */
export class KeyringController extends BaseController<BaseConfig, KeyringState> {
	private keyring: any;
	private mutex = new Mutex();

	/**
	 * Name of this controller used during composition
	 */
	name = 'KeyringController';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['PreferencesController'];

	/**
	 * Creates a KeyringController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<KeyringState>) {
		super(config, state);
		this.keyring = new Keyring({ ...{ initState: state }, ...config });
		this.defaultState = {
			...this.keyring.store.getState(),
			keyrings: []
		};
		this.initialize();
		this.fullUpdate();
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
		return this.fullUpdate();
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
				vault = await this.fullUpdate();
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
		preferences.removeIdentity(address);
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
	 * Signs message by calling down into a specific keyring
	 *
	 * @param messageParams - MessageParams object to sign
	 * @returns - Promise resolving to a signed message string
	 */
	signMessage(messageParams: MessageParams) {
		return this.keyring.signMessage(messageParams);
	}

	/**
	 * Signs message by calling down into a specific keyring
	 *
	 * @param messageParams - MessageParams object to sign
	 * @returns - Promise resolving to a signed message string
	 */
	signPersonalMessage(messageParams: MessageParams) {
		return this.keyring.personalSignMessage(messageParams);
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
		return this.fullUpdate();
	}

	/**
	 * Adds new listener to be notified of state changes
	 *
	 * @param listener - Callback triggered when state changes
	 */
	subscribe(listener: Listener<KeyringState>) {
		this.keyring.store.subscribe(listener);
	}

	/**
	 * Removes existing listener from receiving state changes
	 *
	 * @param listener - Callback to remove
	 * @returns - True if a listener is found and unsubscribed
	 */
	unsubscribe(listener: Listener<KeyringState>) {
		return this.keyring.store.unsubscribe(listener);
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

	async fullUpdate() {
		const keyrings = await Promise.all(
			this.keyring.keyrings.map(async (keyring: KeyringObject, index: number) => {
				const keyringAccounts = await keyring.getAccounts();
				const accounts = Array.isArray(keyringAccounts)
					? keyringAccounts.map((address) => toChecksumAddress(address))
					: [];
				return {
					accounts,
					index,
					type: keyring.type
				};
			})
		);
		this.update({ keyrings: [...keyrings] });
		return this.keyring.fullUpdate();
	}
}

export default KeyringController;
