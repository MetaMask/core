import { bufferToHex } from 'ethereumjs-util';
import {
  recoverPersonalSignature,
  recoverTypedSignature,
  recoverTypedSignature_v4,
  recoverTypedSignatureLegacy,
} from 'eth-sig-util';
import sinon, { SinonStub } from 'sinon';
import Common from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import { MetaMaskKeyring as QRKeyring } from '@keystonehq/metamask-airgapped-keyring';
import { CryptoHDKey, ETHSignature } from '@keystonehq/bc-ur-registry-eth';
import * as uuid from 'uuid';
import MockEncryptor from '../../tests/mocks/mockEncryptor';
import { PreferencesController } from '../user/PreferencesController';
import { MAINNET } from '../constants';
import {
  AccountImportStrategy,
  Keyring,
  KeyringConfig,
  KeyringController,
  KeyringTypes,
  SignTypedDataVersion,
} from './KeyringController';

type ErrorMessageObject = { message: string };

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

const commonConfig = { chain: 'rinkeby', hardfork: 'berlin' };

describe('KeyringController', () => {
  let keyringController: KeyringController;
  let preferences: PreferencesController;
  let initialState: {
    isUnlocked: boolean;
    keyringTypes: string[];
    keyrings: Keyring[];
  };
  const additionalKeyrings = [QRKeyring];
  const baseConfig: Partial<KeyringConfig> = {
    encryptor: new MockEncryptor(),
    keyringTypes: additionalKeyrings,
  };

  beforeEach(async () => {
    preferences = new PreferencesController();
    keyringController = new KeyringController(
      {
        setAccountLabel: preferences.setAccountLabel.bind(preferences),
        removeIdentity: preferences.removeIdentity.bind(preferences),
        syncIdentities: preferences.syncIdentities.bind(preferences),
        updateIdentities: preferences.updateIdentities.bind(preferences),
        setSelectedAddress: preferences.setSelectedAddress.bind(preferences),
      },
      baseConfig,
    );

    initialState = await keyringController.createNewVaultAndKeychain(password);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should set default state', () => {
    expect(keyringController.state.keyrings).not.toStrictEqual([]);
    const keyring = keyringController.state.keyrings[0];
    expect(keyring.accounts).not.toStrictEqual([]);
    expect(keyring.index).toStrictEqual(0);
    expect(keyring.type).toStrictEqual('HD Key Tree');
  });

  it('should add new account', async () => {
    const initialIdentitiesLength = Object.keys(
      preferences.state.identities,
    ).length;
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
    const initialIdentitiesLength = Object.keys(
      preferences.state.identities,
    ).length;
    const currentKeyringMemState =
      await keyringController.addNewAccountWithoutUpdate();
    expect(initialState.keyrings).toHaveLength(1);
    expect(initialState.keyrings[0].accounts).not.toBe(
      currentKeyringMemState.keyrings,
    );
    expect(currentKeyringMemState.keyrings[0].accounts).toHaveLength(2);
    const identitiesLength = Object.keys(preferences.state.identities).length;
    expect(identitiesLength).toStrictEqual(initialIdentitiesLength);
  });

  it('should create new vault, mnemonic and keychain', async () => {
    const currentState = await keyringController.createNewVaultAndKeychain(
      password,
    );
    expect(initialState).not.toBe(currentState);
    const currentSeedWord = await keyringController.exportSeedPhrase(password);
    expect(currentSeedWord).toBeDefined();
  });

  it('should create new vault and restore', async () => {
    const currentState = await keyringController.createNewVaultAndRestore(
      password,
      seedWords,
    );
    expect(initialState).not.toBe(currentState);
  });

  it('should restore same vault if old seedWord is used', async () => {
    const currentSeedWord = await keyringController.exportSeedPhrase(password);
    const currentState = await keyringController.createNewVaultAndRestore(
      password,
      currentSeedWord,
    );
    expect(initialState).toStrictEqual(currentState);
  });

  it('should throw error if creating new vault and restore without password', async () => {
    await expect(
      keyringController.createNewVaultAndRestore('', seedWords)
    ).rejects.toThrow('Invalid password');
  });

  it('should throw error if creating new vault and restore without seedWord', async () => {
    await expect(async () => {
      await keyringController.createNewVaultAndRestore(password, '');
    }).rejects.toThrow('Seed phrase is invalid');
  });

  it('should set locked correctly', () => {
    expect(keyringController.isUnlocked()).toBe(true);
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

  it('should not export account if address is not provided', async () => {
    await expect(
      async () => await keyringController.exportAccount(password, ''),
    ).rejects.toThrow(
      'No keyring found for the requested account. Error info: The address passed in is invalid/empty; There are keyrings, but none match the address;',
    );
  });

  it('should get accounts', async () => {
    const initialAccount = initialState.keyrings[0].accounts;
    const accounts = await keyringController.getAccounts();
    expect(accounts).toStrictEqual(initialAccount);
  });

  it('should import account with strategy privateKey', async () => {
    await expect(
      async () =>
        await keyringController.importAccountWithStrategy(
          AccountImportStrategy.privateKey,
          [],
        ),
    ).rejects.toThrow('Cannot import an empty key.');

    await expect(
      async () =>
        await keyringController.importAccountWithStrategy(
          AccountImportStrategy.privateKey,
          ['123'],
        ),
    ).rejects.toThrow(
      'Expected private key to be an Uint8Array with length 32',
    );

    await expect(
      async () =>
        await keyringController.importAccountWithStrategy(
          AccountImportStrategy.privateKey,
          ['0xblahblah'],
        ),
    ).rejects.toThrow('Cannot import invalid private key.');

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

  it('should not import account with strategy privateKey if wrong data is provided', async () => {
    await expect(
      async () =>
        await keyringController.importAccountWithStrategy(
          AccountImportStrategy.privateKey,
          [],
        ),
    ).rejects.toThrow('Cannot import an empty key.');

    await expect(
      async () =>
        await keyringController.importAccountWithStrategy(
          AccountImportStrategy.privateKey,
          ['123'],
        ),
    ).rejects.toThrow(
      'Expected private key to be an Uint8Array with length 32',
    );
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

  it('should not import account with strategy json', async () => {
    const somePassword = 'holachao123';
    await expect(
      async () =>
        await keyringController.importAccountWithStrategy(
          AccountImportStrategy.json,
          ['', somePassword],
        ),
    ).rejects.toThrow('Unexpected end of JSON input');

    await expect(
      async () =>
        await keyringController.importAccountWithStrategy(
          AccountImportStrategy.json,
          [input, ''],
        ),
    ).rejects.toThrow('Key derivation failed - possibly wrong passphrase');
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
    await expect(
      async () =>
        await keyringController.importAccountWithStrategy(
          AccountImportStrategy.json,
          [input, somePassword],
        ),
    ).rejects.toThrow('Key derivation failed - possibly wrong passphrase');
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

  it('should not sign message even if empty data is passed', async () => {
    await expect(
      async () =>
        await keyringController.signMessage({
          data: '',
          from: initialState.keyrings[0].accounts[0],
        }),
    ).rejects.toThrow('Expected message to be an Uint8Array with length 32');
  });

  it('should not sign message if from account is not passed', async () => {
    await expect(
      async () =>
        await keyringController.signMessage({
          data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
          from: '',
        }),
    ).rejects.toThrow(
      'No keyring found for the requested account. Error info: The address passed in is invalid/empty; There are keyrings, but none match the address;',
    );
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

  /**
   * TODO: signPersonalMessage does not seems to fails for empty data value, check if this is ok
   */
  it('should sign personal message even if empty data is passed', async () => {
    const account = initialState.keyrings[0].accounts[0];
    const signature = await keyringController.signPersonalMessage({
      data: '',
      from: account,
    });
    const recovered = recoverPersonalSignature({ data: '', sig: signature });
    expect(account).toBe(recovered);
  });

  it('should not sign personal message if from account is not passed', async () => {
    await expect(
      async () =>
        await keyringController.signPersonalMessage({
          data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
          from: '',
        }),
    ).rejects.toThrow(
      'No keyring found for the requested account. Error info: The address passed in is invalid/empty; There are keyrings, but none match the address;',
    );
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

    await expect(
      keyringController.signTypedMessage(
        { data: msgParams, from: account },
        SignTypedDataVersion.V1,
      ),
    ).rejects.toThrow('Keyring Controller signTypedMessage:');

    await expect(
      keyringController.signTypedMessage(
        { data: msgParams, from: account },
        SignTypedDataVersion.V3,
      ),
    ).rejects.toThrow('Keyring Controller signTypedMessage:');
  });

  it('should fail in signing message when from address is not provided', async () => {
    let error: unknown = { message: '' };
    try {
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
      await keyringController.signTypedMessage(
        { data: typedMsgParams, from: '' },
        SignTypedDataVersion.V1,
      );
    } catch (e) {
      error = e;
    }

    expect((error as ErrorMessageObject).message).toContain(
      'Keyring Controller signTypedMessage: Error: No keyring found for the requested account. Error info: The address passed in is invalid/empty; There are keyrings, but none match the address;',
    );
  });

  it('should sign transaction', async () => {
    const account = initialState.keyrings[0].accounts[0];
    const txParams = {
      chainId: 3,
      data: '0x1',
      from: account,
      gasLimit: '0x5108',
      gasPrice: '0x5108',
      to: '0x51253087e6f8358b5f10c0a94315d69db3357859',
      value: '0x5208',
    };
    const unsignedEthTx = TransactionFactory.fromTxData(txParams, {
      common: new Common(commonConfig),
      freeze: false,
    });
    expect(unsignedEthTx.v).toBeUndefined();
    const signedTx = await keyringController.signTransaction(
      unsignedEthTx,
      account,
    );
    expect(signedTx.v).not.toBeUndefined();
    expect(signedTx).not.toBe('');
  });

  it('should not sign transaction if from account is not provided', async () => {
    await expect(async () => {
      const account = initialState.keyrings[0].accounts[0];
      const txParams = {
        chainId: 3,
        data: '0x1',
        from: account,
        gasLimit: '0x5108',
        gasPrice: '0x5108',
        to: '0x51253087e6f8358b5f10c0a94315d69db3357859',
        value: '0x5208',
      };
      const unsignedEthTx = TransactionFactory.fromTxData(txParams, {
        common: new Common(commonConfig),
        freeze: false,
      });
      expect(unsignedEthTx.v).toBeUndefined();
      await keyringController.signTransaction(unsignedEthTx, '');
    }).rejects.toThrow(
      'No keyring found for the requested account. Error info: The address passed in is invalid/empty; There are keyrings, but none match the address;',
    );
  });

  /**
   * TODO: There can be a better check in method signTransaction for valid transaction.
   */
  it('should not sign transaction if transaction is not valid', async () => {
    await expect(async () => {
      const account = initialState.keyrings[0].accounts[0];
      const signedTx = await keyringController.signTransaction({}, account);
      expect(signedTx.v).not.toBeUndefined();
      expect(signedTx).not.toBe('');
    }).rejects.toThrow('tx.sign is not a function');
  });

  it('should submit password and decrypt', async () => {
    const state = await keyringController.submitPassword(password);
    expect(state).toStrictEqual(initialState);
  });

  /**
   * TODO: test below should fail for wrong password
   */
  it('should fail on submit password for wrong password', async () => {
    const state = await keyringController.submitPassword('JUNK');
    expect(state).toStrictEqual(initialState);
  });

  it('should subscribe and unsubscribe', async () => {
    const listener = sinon.stub();
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
    const listenerLock = sinon.stub();
    keyringController.onLock(listenerLock);
    await keyringController.setLocked();
    expect(listenerLock.called).toBe(true);
    const listenerUnlock = sinon.stub();
    keyringController.onUnlock(listenerUnlock);
    await keyringController.submitPassword(password);
    expect(listenerUnlock.called).toBe(true);
  });

  it('should return current seedphrase', async () => {
    const seedPhrase = await keyringController.verifySeedPhrase();
    expect(seedPhrase).toBeDefined();
  });

  describe('QR keyring', () => {
    const composeMockSignature = (
      requestId: string,
      signature: string,
    ): ETHSignature => {
      const rlpSignatureData = Buffer.from(signature, 'hex');
      const idBuffer = uuid.parse(requestId);
      return new ETHSignature(
        rlpSignatureData,
        Buffer.from(Uint8Array.from(idBuffer)),
      );
    };

    let signProcessKeyringController: KeyringController;
    preferences = new PreferencesController();

    let requestSignatureStub: SinonStub;
    let readAccountSub: SinonStub;

    const setupQRKeyring = async () => {
      readAccountSub.resolves(
        CryptoHDKey.fromCBOR(
          Buffer.from(
            'a902f40358210219218eb65839d08bde4338640b03fdbbdec439ef880d397c2f881282c5b5d135045820e65ed63f52e3e93d48ffb55cd68c6721e58ead9b29b784b8aba58354f4a3d92905d90131a201183c020006d90130a30186182cf5183cf500f5021a5271c071030307d90130a2018400f480f40300081a625f3e6209684b657973746f6e650a706163636f756e742e7374616e64617264',
            'hex',
          ),
        ),
      );
      await signProcessKeyringController.connectQRHardware(0);
      await signProcessKeyringController.unlockQRHardwareWalletAccount(0);
      await signProcessKeyringController.unlockQRHardwareWalletAccount(1);
      await signProcessKeyringController.unlockQRHardwareWalletAccount(2);
    };

    beforeEach(async () => {
      signProcessKeyringController = new KeyringController(
        {
          setAccountLabel: preferences.setAccountLabel.bind(preferences),
          removeIdentity: preferences.removeIdentity.bind(preferences),
          syncIdentities: preferences.syncIdentities.bind(preferences),
          updateIdentities: preferences.updateIdentities.bind(preferences),
          setSelectedAddress: preferences.setSelectedAddress.bind(preferences),
        },
        baseConfig,
      );
      await signProcessKeyringController.createNewVaultAndKeychain(password);
      const qrkeyring = await signProcessKeyringController.getOrAddQRKeyring();
      qrkeyring.forgetDevice();

      requestSignatureStub = sinon.stub(
        qrkeyring.getInteraction(),
        'requestSignature',
      );

      readAccountSub = sinon.stub(
        qrkeyring.getInteraction(),
        'readCryptoHDKeyOrCryptoAccount',
      );
    });

    it('should setup QR keyring with crypto-hdkey', async () => {
      readAccountSub.resolves(
        CryptoHDKey.fromCBOR(
          Buffer.from(
            'a902f40358210219218eb65839d08bde4338640b03fdbbdec439ef880d397c2f881282c5b5d135045820e65ed63f52e3e93d48ffb55cd68c6721e58ead9b29b784b8aba58354f4a3d92905d90131a201183c020006d90130a30186182cf5183cf500f5021a5271c071030307d90130a2018400f480f40300081a625f3e6209684b657973746f6e650a706163636f756e742e7374616e64617264',
            'hex',
          ),
        ),
      );

      const firstPage = await signProcessKeyringController.connectQRHardware(0);
      expect(firstPage).toHaveLength(5);
      expect(firstPage[0].index).toBe(0);

      const secondPage = await signProcessKeyringController.connectQRHardware(
        1,
      );
      expect(secondPage).toHaveLength(5);
      expect(secondPage[0].index).toBe(5);

      const goBackPage = await signProcessKeyringController.connectQRHardware(
        -1,
      );
      expect(goBackPage).toStrictEqual(firstPage);

      await signProcessKeyringController.unlockQRHardwareWalletAccount(0);
      await signProcessKeyringController.unlockQRHardwareWalletAccount(1);
      await signProcessKeyringController.unlockQRHardwareWalletAccount(2);

      const qrKeyring = signProcessKeyringController.state.keyrings.find(
        (keyring) => keyring.type === KeyringTypes.qr,
      );
      expect(qrKeyring?.accounts).toHaveLength(3);
    });

    it('should sign message with QR keyring', async () => {
      await setupQRKeyring();
      requestSignatureStub.resolves(
        composeMockSignature(
          '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          '4cb25933c5225f9f92fc9b487451b93bc3646c6aa01b72b01065b8509ac4fd6c37798695d0d5c0949ed10c5e102800ea2b62c2b670729c5631c81b0c52002a641b',
        ),
      );

      const data =
        '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0';
      const qrKeyring = signProcessKeyringController.state.keyrings.find(
        (keyring) => keyring.type === KeyringTypes.qr,
      );
      const account = qrKeyring?.accounts[0] || '';
      const signature = await signProcessKeyringController.signMessage({
        data,
        from: account,
      });
      expect(signature).not.toBe('');
    });

    it('should sign personal message with QR keyring', async () => {
      await setupQRKeyring();
      requestSignatureStub.resolves(
        composeMockSignature(
          '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          '73f31609b618050c4058e8f959961c203470657e7218a21d8b94ac1bdef80f255ac5e7a07493302443296ccb20a04ebfa0c8f6ea4dd9134c19ecd65673c336261b',
        ),
      );

      const data = bufferToHex(
        Buffer.from('Example `personal_sign` message', 'utf8'),
      );
      const qrKeyring = signProcessKeyringController.state.keyrings.find(
        (keyring) => keyring.type === KeyringTypes.qr,
      );
      const account = qrKeyring?.accounts[0] || '';
      const signature = await signProcessKeyringController.signPersonalMessage({
        data,
        from: account,
      });
      const recovered = recoverPersonalSignature({ data, sig: signature });
      expect(account.toLowerCase()).toBe(recovered.toLowerCase());
    });

    it('should sign typed message V1 with QR keyring', async () => {
      await setupQRKeyring();
      requestSignatureStub.resolves(
        composeMockSignature(
          '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          '4b9b4cde5c883e3281a5a603179379817a94796f3a06079374db94f0b2c1882c5e708de2fa0ec84d74b3819f7baae0d310b4494d101359afe470910bec5d36071b',
        ),
      );

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
      const qrKeyring = signProcessKeyringController.state.keyrings.find(
        (keyring) => keyring.type === KeyringTypes.qr,
      );
      const account = qrKeyring?.accounts[0] || '';
      const signature = await signProcessKeyringController.signTypedMessage(
        { data: typedMsgParams, from: account },
        SignTypedDataVersion.V1,
      );
      const recovered = recoverTypedSignatureLegacy({
        data: typedMsgParams,
        sig: signature as string,
      });
      expect(account.toLowerCase()).toBe(recovered.toLowerCase());
    });

    it('should sign typed message V3 with QR keyring', async () => {
      await setupQRKeyring();
      requestSignatureStub.resolves(
        composeMockSignature(
          '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          '112e4591abc834251f2671127acabebf33be3a8d8fa15312e94ba0f008e53d697930b4ae99cb36955e1c96fee888cf1ed6e314769db0bd4d6246d492b8685fd21c',
        ),
      );

      const msg =
        '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Person":[{"name":"name","type":"string"},{"name":"wallet","type":"address"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person"},{"name":"contents","type":"string"}]},"primaryType":"Mail","domain":{"name":"Ether Mail","version":"1","chainId":4,"verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"},"message":{"from":{"name":"Cow","wallet":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},"to":{"name":"Bob","wallet":"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},"contents":"Hello, Bob!"}}';

      const qrKeyring = signProcessKeyringController.state.keyrings.find(
        (keyring) => keyring.type === KeyringTypes.qr,
      );
      const account = qrKeyring?.accounts[0] || '';
      const signature = await signProcessKeyringController.signTypedMessage(
        {
          data: msg,
          from: account,
        },
        SignTypedDataVersion.V3,
      );
      const recovered = recoverTypedSignature({
        data: JSON.parse(msg),
        sig: signature as string,
      });
      expect(account.toLowerCase()).toBe(recovered);
    });

    it('should sign typed message V4 with QR keyring', async () => {
      await setupQRKeyring();
      requestSignatureStub.resolves(
        composeMockSignature(
          '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          '1271c3de4683ed99b11ceecc0a81f48701057174eb0edd729342ecdd9e061ed26eea3c4b84d232e01de00f1f3884fdfe15f664fe2c58c2e565d672b3cb281ccb1c',
        ),
      );

      const msg =
        '{"domain":{"chainId":"4","name":"Ether Mail","verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC","version":"1"},"message":{"contents":"Hello, Bob!","from":{"name":"Cow","wallets":["0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826","0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF"]},"to":[{"name":"Bob","wallets":["0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB","0xB0BdaBea57B0BDABeA57b0bdABEA57b0BDabEa57","0xB0B0b0b0b0b0B000000000000000000000000000"]}]},"primaryType":"Mail","types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Group":[{"name":"name","type":"string"},{"name":"members","type":"Person[]"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person[]"},{"name":"contents","type":"string"}],"Person":[{"name":"name","type":"string"},{"name":"wallets","type":"address[]"}]}}';

      const qrKeyring = signProcessKeyringController.state.keyrings.find(
        (keyring) => keyring.type === KeyringTypes.qr,
      );
      const account = qrKeyring?.accounts[0] || '';
      const signature = await signProcessKeyringController.signTypedMessage(
        { data: msg, from: account },
        SignTypedDataVersion.V4,
      );
      const recovered = recoverTypedSignature_v4({
        data: JSON.parse(msg),
        sig: signature as string,
      });
      expect(account.toLowerCase()).toBe(recovered);
    });

    it('should sign transaction with QR keyring', async () => {
      await setupQRKeyring();
      requestSignatureStub.resolves(
        composeMockSignature(
          '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          '33ea4c1dc4b201ad1b1feaf172aadf60dcf2f8bd76d941396bfaebfc3b2868b0340d5689341925c99cdea39e3c5daf7fe2776f220e5b018e85d3b1df19c7bc4701',
        ),
      );

      const qrKeyring = signProcessKeyringController.state.keyrings.find(
        (keyring) => keyring.type === KeyringTypes.qr,
      );
      const account = qrKeyring?.accounts[0] || '';
      const tx = TransactionFactory.fromTxData(
        {
          accessList: [],
          chainId: '0x4',
          data: '0x',
          gasLimit: '0x5208',
          maxFeePerGas: '0x2540be400',
          maxPriorityFeePerGas: '0x3b9aca00',
          nonce: '0x68',
          r: undefined,
          s: undefined,
          to: '0x0c54fccd2e384b4bb6f2e405bf5cbc15a017aafb',
          v: undefined,
          value: '0x0',
          type: 2,
        },
        {
          common: Common.forCustomChain(
            MAINNET,
            {
              name: 'rinkeby',
              chainId: parseInt('4'),
              networkId: parseInt('4'),
            },
            'london',
          ),
        },
      );
      const signedTx = await signProcessKeyringController.signTransaction(
        tx,
        account,
      );
      expect(signedTx.v).not.toBeUndefined();
      expect(signedTx).not.toBe('');
    });

    it('should reset qr keyring state', async () => {
      await setupQRKeyring();
      (await signProcessKeyringController.getQRKeyringState()).updateState({
        sign: {
          request: {
            requestId: 'test',
            payload: {
              cbor: 'test',
              type: 'test',
            },
          },
        },
      });

      expect(
        (await signProcessKeyringController.getQRKeyringState()).getState().sign
          .request,
      ).toBeDefined();

      await signProcessKeyringController.resetQRKeyringState();

      expect(
        (await signProcessKeyringController.getQRKeyringState()).getState().sign
          .request,
      ).toBeUndefined();
    });

    it('should forget qr keyring', async () => {
      await setupQRKeyring();
      expect(
        signProcessKeyringController.state.keyrings[1].accounts,
      ).toHaveLength(3);
      await signProcessKeyringController.forgetQRDevice();
      expect(
        signProcessKeyringController.state.keyrings[1].accounts,
      ).toHaveLength(0);
    });

    it('should restore qr keyring', async () => {
      const serializedQRKeyring = {
        initialized: true,
        accounts: ['0xE410157345be56688F43FF0D9e4B2B38Ea8F7828'],
        currentAccount: 0,
        page: 0,
        perPage: 5,
        keyringAccount: 'account.standard',
        keyringMode: 'hd',
        name: 'Keystone',
        version: 1,
        xfp: '5271c071',
        xpub: 'xpub6CNhtuXAHDs84AhZj5ALZB6ii4sP5LnDXaKDSjiy6kcBbiysq89cDrLG29poKvZtX9z4FchZKTjTyiPuDeiFMUd1H4g5zViQxt4tpkronJr',
        hdPath: "m/44'/60'/0'",
        childrenPath: '0/*',
        indexes: {
          '0xE410157345be56688F43FF0D9e4B2B38Ea8F7828': 0,
          '0xEEACb7a5e53600c144C0b9839A834bb4b39E540c': 1,
          '0xA116800A72e56f91cF1677D40C9984f9C9f4B2c7': 2,
          '0x4826BadaBC9894B3513e23Be408605611b236C0f': 3,
          '0x8a1503beb17Ef02cC4Ff288b0A73583c4ce547c7': 4,
        },
        paths: {},
      };
      await signProcessKeyringController.restoreQRKeyring(serializedQRKeyring);
      expect(
        signProcessKeyringController.state.keyrings[1].accounts,
      ).toHaveLength(1);
    });

    it('should get account keyring type', async () => {
      await setupQRKeyring();
      const qrAccount = '0xE410157345be56688F43FF0D9e4B2B38Ea8F7828';
      const hdAccount =
        signProcessKeyringController.state.keyrings[0].accounts[0];
      expect(
        await signProcessKeyringController.getAccountKeyringType(hdAccount),
      ).toBe(KeyringTypes.hd);

      expect(
        await signProcessKeyringController.getAccountKeyringType(qrAccount),
      ).toBe(KeyringTypes.qr);
    });

    it("should call qr keyring's methods", async () => {
      await setupQRKeyring();
      const qrKeyring = await signProcessKeyringController.getOrAddQRKeyring();

      const submitCryptoHDKeyStub = sinon.stub(qrKeyring, 'submitCryptoHDKey');
      submitCryptoHDKeyStub.resolves();
      await signProcessKeyringController.submitQRCryptoHDKey('anything');
      expect(submitCryptoHDKeyStub.calledWith('anything')).toBe(true);

      const submitCryptoAccountStub = sinon.stub(
        qrKeyring,
        'submitCryptoAccount',
      );
      submitCryptoAccountStub.resolves();
      await signProcessKeyringController.submitQRCryptoAccount('anything');
      expect(submitCryptoAccountStub.calledWith('anything')).toBe(true);

      const submitSignatureStub = sinon.stub(qrKeyring, 'submitSignature');
      submitSignatureStub.resolves();
      await signProcessKeyringController.submitQRSignature(
        'anything',
        'anything',
      );
      expect(submitSignatureStub.calledWith('anything', 'anything')).toBe(true);

      const cancelSignRequestStub = sinon.stub(qrKeyring, 'cancelSignRequest');
      cancelSignRequestStub.resolves();
      await signProcessKeyringController.cancelQRSignRequest();
      expect(cancelSignRequestStub.called).toBe(true);
    });
  });
});
