import { bufferToHex } from 'ethereumjs-util';
import {
  recoverPersonalSignature,
  recoverTypedSignature,
  recoverTypedSignature_v4,
  recoverTypedSignatureLegacy,
} from 'eth-sig-util';
import { stub } from 'sinon';
import Transaction from 'ethereumjs-tx';
import MockEncryptor from '../../tests/mocks/mockEncryptor';
import PreferencesController from '../user/PreferencesController';
import KeyringController, {
  AccountImportStrategy,
  Keyring,
  KeyringConfig,
  SignTypedDataVersion,
} from './KeyringController';

const input =
  '{"version":3,"id":"534e0199-53f6-41a9-a8fe-d504702ee5e8","address":"b97c80fab7a3793bbe746864db80d236f1345ea7",' +
  '"crypto":{"ciphertext":"974fec42023c2d6340d9710863aa82a2961aa03b9d7e5dd19aa77ab4aab1f344",' +
  '"cipherparams":{"iv":"eba107752a238d2dd26e543860dccec4"},"cipher":"aes-128-ctr","kdf":"scrypt",' +
  '"kdfparams":{"dklen":32,"salt":"2a8894ff056db4cc1851e45390996dd26b075e5ceaf72c13ca4c202f94ca468a",' +
  '"n":131072,"r":8,"p":1},"mac":"8bd084028ecb331275a76583d41fe0e1212825a6d155e904d1baf448d33e7150"}}';
const seedWords =
  'puzzle seed penalty soldier say clay field arctic metal hen cage runway';
const privateKey =
  '1e4e6a4c0c077f4ae8ddfbf372918e61dd0fb4a4cfa592cb16e7546d505e68fc';
const password = 'password123';

describe('KeyringController', () => {
  let keyringController: KeyringController;
  let preferences: PreferencesController;
  let initialState: {
    isUnlocked: boolean;
    keyringTypes: string[];
    keyrings: Keyring[];
  };
  const baseConfig: Partial<KeyringConfig> = { encryptor: new MockEncryptor() };
  beforeEach(async () => {
    preferences = new PreferencesController();
    keyringController = new KeyringController(
      {
        removeIdentity: preferences.removeIdentity.bind(preferences),
        syncIdentities: preferences.syncIdentities.bind(preferences),
        updateIdentities: preferences.updateIdentities.bind(preferences),
        setSelectedAddress: preferences.setSelectedAddress.bind(preferences),
      },
      baseConfig,
    );

    initialState = await keyringController.createNewVaultAndKeychain(password);
  });

  it('should set default state', () => {
    expect(keyringController.state.keyrings).not.toStrictEqual([]);
    const keyring = keyringController.state.keyrings[0];
    expect(keyring.accounts).not.toStrictEqual([]);
    expect(keyring.index).toStrictEqual(0);
    expect(keyring.type).toStrictEqual('HD Key Tree');
  });

  it('should add new account', async () => {
    const initialIdentitiesLength = Object.keys(preferences.state.identities)
      .length;
    const currentKeyringMemState = await keyringController.addNewAccount();
    expect(initialState.keyrings).toHaveLength(1);
    expect(initialState.keyrings[0].accounts).not.toBe(
      currentKeyringMemState.keyrings,
    );
    expect(currentKeyringMemState.keyrings[0].accounts).toHaveLength(2);
    const identitiesLength = Object.keys(preferences.state.identities).length;
    expect(identitiesLength).toBeGreaterThan(initialIdentitiesLength);
  });

  it('should add new account without updating', async () => {
    const initialIdentitiesLength = Object.keys(preferences.state.identities)
      .length;
    const currentKeyringMemState = await keyringController.addNewAccountWithoutUpdate();
    expect(initialState.keyrings).toHaveLength(1);
    expect(initialState.keyrings[0].accounts).not.toBe(
      currentKeyringMemState.keyrings,
    );
    expect(currentKeyringMemState.keyrings[0].accounts).toHaveLength(2);
    const identitiesLength = Object.keys(preferences.state.identities).length;
    expect(identitiesLength).toStrictEqual(initialIdentitiesLength);
  });

  it('should create new vault and keychain', async () => {
    const currentState = await keyringController.createNewVaultAndKeychain(
      password,
    );
    expect(initialState).not.toBe(currentState);
  });

  it('should create new vault and restore', async () => {
    const currentState = await keyringController.createNewVaultAndRestore(
      password,
      seedWords,
    );
    expect(initialState).not.toBe(currentState);
  });

  it('should set locked correctly', () => {
    keyringController.setLocked();
    expect(keyringController.isUnlocked()).toBe(false);
  });

  it('should export seed phrase', () => {
    const seed = keyringController.exportSeedPhrase(password);
    expect(seed).not.toBe('');
    expect(() => keyringController.exportSeedPhrase('')).toThrow(
      'Invalid password',
    );
  });

  it('should export account', async () => {
    const account = initialState.keyrings[0].accounts[0];
    const newPrivateKey = await keyringController.exportAccount(
      password,
      account,
    );
    expect(newPrivateKey).not.toBe('');
    expect(() => keyringController.exportAccount('', account)).toThrow(
      'Invalid password',
    );
  });

  it('should get accounts', async () => {
    const initialAccount = initialState.keyrings[0].accounts;
    const accounts = await keyringController.getAccounts();
    expect(accounts).toStrictEqual(initialAccount);
  });

  it('should import account with strategy privateKey', async () => {
    let error1;
    try {
      await keyringController.importAccountWithStrategy(
        AccountImportStrategy.privateKey,
        [],
      );
    } catch (e) {
      error1 = e;
    }
    let error2;
    try {
      await keyringController.importAccountWithStrategy(
        AccountImportStrategy.privateKey,
        ['123'],
      );
    } catch (e) {
      error2 = e;
    }
    expect(error1.message).toBe('Cannot import an empty key.');
    expect(error2.message).toBe('Cannot import invalid private key.');
    const address = '0x51253087e6f8358b5f10c0a94315d69db3357859';
    const newKeyring = { accounts: [address], type: 'Simple Key Pair' };
    const obj = await keyringController.importAccountWithStrategy(
      AccountImportStrategy.privateKey,
      [privateKey],
    );
    const modifiedState = {
      ...initialState,
      keyrings: [initialState.keyrings[0], newKeyring],
    };
    expect(obj).toStrictEqual(modifiedState);
  });

  it('should import account with strategy json', async () => {
    const somePassword = 'holachao123';
    const address = '0xb97c80fab7a3793bbe746864db80d236f1345ea7';
    const obj = await keyringController.importAccountWithStrategy(
      AccountImportStrategy.json,
      [input, somePassword],
    );
    const newKeyring = { accounts: [address], type: 'Simple Key Pair' };
    const modifiedState = {
      ...initialState,
      keyrings: [initialState.keyrings[0], newKeyring],
    };
    expect(obj).toStrictEqual(modifiedState);
  });

  it('should throw when passed an unrecognized strategy', async () => {
    const somePassword = 'holachao123';
    await expect(
      keyringController.importAccountWithStrategy(
        'junk' as AccountImportStrategy,
        [input, somePassword],
      ),
    ).rejects.toThrow("Unexpected import strategy: 'junk'");
  });

  it('should import account with strategy json wrong password', async () => {
    const somePassword = 'holachao12';
    let error;
    try {
      await keyringController.importAccountWithStrategy(
        AccountImportStrategy.json,
        [input, somePassword],
      );
    } catch (e) {
      error = e;
    }
    expect(error.message).toBe(
      'Key derivation failed - possibly wrong passphrase',
    );
  });

  it('should remove account', async () => {
    await keyringController.importAccountWithStrategy(
      AccountImportStrategy.privateKey,
      [privateKey],
    );
    const finalState = await keyringController.removeAccount(
      '0x51253087e6f8358b5f10c0a94315d69db3357859',
    );
    expect(finalState).toStrictEqual(initialState);
  });

  it('should sign message', async () => {
    const data =
      '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0';
    const account = initialState.keyrings[0].accounts[0];
    const signature = await keyringController.signMessage({
      data,
      from: account,
    });
    expect(signature).not.toBe('');
  });

  it('should sign personal message', async () => {
    const data = bufferToHex(Buffer.from('Hello from test', 'utf8'));
    const account = initialState.keyrings[0].accounts[0];
    const signature = await keyringController.signPersonalMessage({
      data,
      from: account,
    });
    const recovered = recoverPersonalSignature({ data, sig: signature });
    expect(account).toBe(recovered);
  });

  it('should throw when given invalid version', async () => {
    const typedMsgParams = [
      {
        name: 'Message',
        type: 'string',
        value: 'Hi, Alice!',
      },
      {
        name: 'A number',
        type: 'uint32',
        value: '1337',
      },
    ];
    const account = initialState.keyrings[0].accounts[0];
    await expect(
      keyringController.signTypedMessage(
        { data: typedMsgParams, from: account },
        'junk' as SignTypedDataVersion,
      ),
    ).rejects.toThrow(
      "Keyring Controller signTypedMessage: Error: Unexpected signTypedMessage version: 'junk'",
    );
  });

  it('should sign typed message V1', async () => {
    const typedMsgParams = [
      {
        name: 'Message',
        type: 'string',
        value: 'Hi, Alice!',
      },
      {
        name: 'A number',
        type: 'uint32',
        value: '1337',
      },
    ];
    const account = initialState.keyrings[0].accounts[0];
    const signature = await keyringController.signTypedMessage(
      { data: typedMsgParams, from: account },
      SignTypedDataVersion.V1,
    );
    const recovered = recoverTypedSignatureLegacy({
      data: typedMsgParams,
      sig: signature as string,
    });
    expect(account).toBe(recovered);
  });

  it('should sign typed message V3', async () => {
    const msgParams = {
      domain: {
        chainId: 1,
        name: 'Ether Mail',
        verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
        version: '1',
      },
      message: {
        contents: 'Hello, Bob!',
        from: {
          name: 'Cow',
          wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
        },
        to: {
          name: 'Bob',
          wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
        },
      },
      primaryType: 'Mail',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Mail: [
          { name: 'from', type: 'Person' },
          { name: 'to', type: 'Person' },
          { name: 'contents', type: 'string' },
        ],
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' },
        ],
      },
    };
    const account = initialState.keyrings[0].accounts[0];
    const signature = await keyringController.signTypedMessage(
      { data: JSON.stringify(msgParams), from: account },
      SignTypedDataVersion.V3,
    );
    const recovered = recoverTypedSignature({
      data: msgParams as any,
      sig: signature as string,
    });
    expect(account).toBe(recovered);
  });

  it('should sign typed message V4', async () => {
    const msgParams = {
      domain: {
        chainId: 1,
        name: 'Ether Mail',
        verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
        version: '1',
      },
      message: {
        contents: 'Hello, Bob!',
        from: {
          name: 'Cow',
          wallets: [
            '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
            '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF',
          ],
        },
        to: [
          {
            name: 'Bob',
            wallets: [
              '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
              '0xB0BdaBea57B0BDABeA57b0bdABEA57b0BDabEa57',
              '0xB0B0b0b0b0b0B000000000000000000000000000',
            ],
          },
        ],
      },
      primaryType: 'Mail',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Group: [
          { name: 'name', type: 'string' },
          { name: 'members', type: 'Person[]' },
        ],
        Mail: [
          { name: 'from', type: 'Person' },
          { name: 'to', type: 'Person[]' },
          { name: 'contents', type: 'string' },
        ],
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallets', type: 'address[]' },
        ],
      },
    };

    const account = initialState.keyrings[0].accounts[0];
    const signature = await keyringController.signTypedMessage(
      { data: JSON.stringify(msgParams), from: account },
      SignTypedDataVersion.V4,
    );
    const recovered = recoverTypedSignature_v4({
      data: msgParams as any,
      sig: signature as string,
    });
    expect(account).toBe(recovered);
  });

  it('should fail when sign typed message format is wrong', async () => {
    const msgParams = [{}];
    const account = initialState.keyrings[0].accounts[0];
    let error1;
    try {
      await keyringController.signTypedMessage(
        { data: msgParams, from: account },
        SignTypedDataVersion.V1,
      );
    } catch (e) {
      error1 = e;
    }
    let error2;
    try {
      await keyringController.signTypedMessage(
        { data: msgParams, from: account },
        SignTypedDataVersion.V3,
      );
    } catch (e) {
      error2 = e;
    }
    expect(error1.message).toContain('Keyring Controller signTypedMessage:');
    expect(error2.message).toContain('Keyring Controller signTypedMessage:');
  });

  it('should sign transaction', async () => {
    const account = initialState.keyrings[0].accounts[0];
    const transaction = {
      chainId: 3,
      data: '0x1',
      from: account,
      gasLimit: '0x5108',
      gasPrice: '0x5108',
      to: '0x51253087e6f8358b5f10c0a94315d69db3357859',
      value: '0x5208',
    };
    const ethTransaction = new Transaction({ ...transaction });
    const signature = await keyringController.signTransaction(
      ethTransaction,
      account,
    );
    expect(signature).not.toBe('');
  });

  it('should submit password and decrypt', async () => {
    const state = await keyringController.submitPassword(password);
    expect(state).toStrictEqual(initialState);
  });

  it('should subscribe and unsubscribe', async () => {
    const listener = stub();
    keyringController.subscribe(listener);
    await keyringController.importAccountWithStrategy(
      AccountImportStrategy.privateKey,
      [privateKey],
    );
    expect(listener.called).toBe(true);
    keyringController.unsubscribe(listener);
    await keyringController.removeAccount(
      '0x51253087e6f8358b5f10c0a94315d69db3357859',
    );
    expect(listener.calledTwice).toBe(false);
  });

  it('should receive lock and unlock events', async () => {
    const listenerLock = stub();
    keyringController.onLock(listenerLock);
    await keyringController.setLocked();
    expect(listenerLock.called).toBe(true);
    const listenerUnlock = stub();
    keyringController.onUnlock(listenerUnlock);
    await keyringController.submitPassword(password);
    expect(listenerUnlock.called).toBe(true);
  });
});
