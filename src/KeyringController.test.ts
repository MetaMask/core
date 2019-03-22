import KeyringController, { Keyring } from './KeyringController';
import PreferencesController from './PreferencesController';
import ComposableController from './ComposableController';
import { KeyringConfig } from './KeyringController';
const mockEncryptor: any = require('../node_modules/eth-keyring-controller/test/lib/mock-encryptor.js');

describe('KeyringController', () => {
	let keyringController: KeyringController;
	let preferences: PreferencesController;
	let password: string;
	let initialState: { isUnlocked: boolean; keyringTypes: string[]; keyrings: Keyring[] };
	const baseConfig: Partial<KeyringConfig> = { encryptor: mockEncryptor };
	beforeEach(async () => {
		keyringController = new KeyringController(baseConfig);
		preferences = new PreferencesController();
		password = 'password123';
		/* tslint:disable-next-line:no-unused-expression */
		new ComposableController([keyringController, preferences]);
		initialState = await keyringController.createNewVaultAndKeychain(password);
	});

	it('should set default state', () => {
		expect(keyringController.state.keyrings).not.toEqual([]);
		const keyring = keyringController.state.keyrings[0];
		expect(keyring.accounts).not.toEqual([]);
		expect(keyring.index).toEqual(0);
		expect(keyring.type).toEqual('HD Key Tree');
	});

	it('should not add new account if no primary keyring', async () => {
		try {
			await keyringController.addNewAccount();
		} catch (e) {
			expect(e.message).toBe('No HD keyring found');
		}
	});

	it('should add new account', async () => {
		const currentKeyringMemState = await keyringController.addNewAccount();
		expect(initialState.keyrings.length).toBe(1);
		expect(initialState.keyrings[0].accounts).not.toBe(currentKeyringMemState.keyrings);
		expect(currentKeyringMemState.keyrings[0].accounts.length).toBe(2);
	});

	it('should create new vault and keychain', async () => {
		const currentState = await keyringController.createNewVaultAndKeychain(password);
		expect(initialState).not.toBe(currentState);
	});

	it('should set locked correctly', async () => {
		keyringController.setLocked();
		expect(keyringController.isUnlocked()).toBe(false);
	});
});
