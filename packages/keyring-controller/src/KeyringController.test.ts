import { bufferToHex } from 'ethereumjs-util';
import {
  normalize,
  recoverPersonalSignature,
  recoverTypedSignature,
  SignTypedDataVersion,
} from '@metamask/eth-sig-util';
import * as sinon from 'sinon';
import Common from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import { MetaMaskKeyring as QRKeyring } from '@keystonehq/metamask-airgapped-keyring';
import { CryptoHDKey, ETHSignature } from '@keystonehq/bc-ur-registry-eth';
import * as uuid from 'uuid';
import { isValidHexAddress, NetworkType } from '@metamask/controller-utils';
import { keyringBuilderFactory } from '@metamask/eth-keyring-controller';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';
import { ControllerMessenger } from '@metamask/base-controller';
import MockEncryptor, { mockKey } from '../tests/mocks/mockEncryptor';
import {
  AccountImportStrategy,
  KeyringController,
  KeyringObject,
  KeyringControllerEvents,
  KeyringControllerMessenger,
  KeyringControllerConfig,
  KeyringControllerState,
  KeyringTypes,
} from './KeyringController';

jest.mock('uuid', () => {
  return {
    ...jest.requireActual('uuid'),
    v4: () => '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  };
});

const input =
  '{"version":3,"id":"534e0199-53f6-41a9-a8fe-d504702ee5e8","address":"b97c80fab7a3793bbe746864db80d236f1345ea7",' +
  '"crypto":{"ciphertext":"974fec42023c2d6340d9710863aa82a2961aa03b9d7e5dd19aa77ab4aab1f344",' +
  '"cipherparams":{"iv":"eba107752a238d2dd26e543860dccec4"},"cipher":"aes-128-ctr","kdf":"scrypt",' +
  '"kdfparams":{"dklen":32,"salt":"2a8894ff056db4cc1851e45390996dd26b075e5ceaf72c13ca4c202f94ca468a",' +
  '"n":131072,"r":8,"p":1},"mac":"8bd084028ecb331275a76583d41fe0e1212825a6d155e904d1baf448d33e7150"}}';
const seedWords =
  'puzzle seed penalty soldier say clay field arctic metal hen cage runway';
const uint8ArraySeed = new Uint8Array(
  new Uint16Array(
    seedWords.split(' ').map((word) => wordlist.indexOf(word)),
  ).buffer,
);
const privateKey =
  '1e4e6a4c0c077f4ae8ddfbf372918e61dd0fb4a4cfa592cb16e7546d505e68fc';
const password = 'password123';

const commonConfig = { chain: 'goerli', hardfork: 'berlin' };

describe('KeyringController', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('addNewAccount', () => {
    describe('when accountCount is not provided', () => {
      it('should add new account', async () => {
        await withController(
          async ({ controller, initialState, preferences }) => {
            const {
              keyringState: currentKeyringMemState,
              addedAccountAddress,
            } = await controller.addNewAccount();
            expect(initialState.keyrings).toHaveLength(1);
            expect(initialState.keyrings[0].accounts).not.toStrictEqual(
              currentKeyringMemState.keyrings[0].accounts,
            );
            expect(currentKeyringMemState.keyrings[0].accounts).toHaveLength(2);
            expect(initialState.keyrings[0].accounts).not.toContain(
              addedAccountAddress,
            );
            expect(addedAccountAddress).toBe(
              currentKeyringMemState.keyrings[0].accounts[1],
            );
            expect(
              preferences.updateIdentities.calledWith(
                currentKeyringMemState.keyrings[0].accounts,
              ),
            ).toBe(true);
            expect(preferences.setSelectedAddress.called).toBe(false);
          },
        );
      });
    });

    describe('when accountCount is provided', () => {
      it('should add new account if accountCount is in sequence', async () => {
        await withController(
          async ({ controller, initialState, preferences }) => {
            const {
              keyringState: currentKeyringMemState,
              addedAccountAddress,
            } = await controller.addNewAccount(
              initialState.keyrings[0].accounts.length,
            );
            expect(initialState.keyrings).toHaveLength(1);
            expect(initialState.keyrings[0].accounts).not.toStrictEqual(
              currentKeyringMemState.keyrings[0].accounts,
            );
            expect(currentKeyringMemState.keyrings[0].accounts).toHaveLength(2);
            expect(initialState.keyrings[0].accounts).not.toContain(
              addedAccountAddress,
            );
            expect(addedAccountAddress).toBe(
              currentKeyringMemState.keyrings[0].accounts[1],
            );
            expect(
              preferences.updateIdentities.calledWith(
                currentKeyringMemState.keyrings[0].accounts,
              ),
            ).toBe(true);
            expect(preferences.setSelectedAddress.called).toBe(false);
          },
        );
      });

      it('should throw an error if passed accountCount param is out of sequence', async () => {
        await withController(async ({ controller, initialState }) => {
          const accountCount = initialState.keyrings[0].accounts.length;
          await expect(
            controller.addNewAccount(accountCount + 1),
          ).rejects.toThrow('Account out of sequence');
        });
      });

      it('should not add a new account if called twice with the same accountCount param', async () => {
        await withController(async ({ controller, initialState }) => {
          const accountCount = initialState.keyrings[0].accounts.length;
          const { addedAccountAddress: firstAccountAdded } =
            await controller.addNewAccount(accountCount);
          const { keyringState, addedAccountAddress: secondAccountAdded } =
            await controller.addNewAccount(accountCount);
          expect(firstAccountAdded).toBe(secondAccountAdded);
          expect(keyringState.keyrings[0].accounts).toHaveLength(
            accountCount + 1,
          );
        });
      });
    });
  });

  describe('addNewAccountWithoutUpdate', () => {
    it('should add new account without updating', async () => {
      await withController(
        async ({ controller, initialState, preferences }) => {
          const initialUpdateIdentitiesCallCount =
            preferences.updateIdentities.callCount;
          const currentKeyringMemState =
            await controller.addNewAccountWithoutUpdate();
          expect(initialState.keyrings).toHaveLength(1);
          expect(initialState.keyrings[0].accounts).not.toStrictEqual(
            currentKeyringMemState.keyrings[0].accounts,
          );
          expect(currentKeyringMemState.keyrings[0].accounts).toHaveLength(2);
          // we make sure that updateIdentities is not called
          // during this test
          expect(preferences.updateIdentities.callCount).toBe(
            initialUpdateIdentitiesCallCount,
          );
        },
      );
    });
  });

  describe('createNewVaultAndRestore', () => {
    [false, true].map((cacheEncryptionKey) =>
      describe(`when cacheEncryptionKey is ${cacheEncryptionKey}`, () => {
        it('should create new vault and restore', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller, initialState }) => {
              const initialVault = controller.state.vault;
              const currentState = await controller.createNewVaultAndRestore(
                password,
                uint8ArraySeed,
              );
              expect(initialState).not.toBe(currentState);
              expect(controller.state.vault).toBeDefined();
              expect(controller.state.vault).toStrictEqual(initialVault);
            },
          );
        });

        it('should restore same vault if old seedWord is used', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller, initialState }) => {
              const currentSeedWord = await controller.exportSeedPhrase(
                password,
              );

              const currentState = await controller.createNewVaultAndRestore(
                password,
                currentSeedWord,
              );
              expect(initialState).toStrictEqual(currentState);
            },
          );
        });

        it('should throw error if creating new vault and restore without password', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller }) => {
              await expect(
                controller.createNewVaultAndRestore('', uint8ArraySeed),
              ).rejects.toThrow('Invalid password');
            },
          );
        });

        it('should throw error if creating new vault and restoring without seed phrase', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller }) => {
              await expect(
                controller.createNewVaultAndRestore(
                  password,
                  // @ts-expect-error invalid seed phrase
                  '',
                ),
              ).rejects.toThrow(
                'Eth-Hd-Keyring: Deserialize method cannot be called with an opts value for numberOfAccounts and no menmonic',
              );
            },
          );
        });

        cacheEncryptionKey &&
          it('should set encryptionKey and encryptionSalt in state', async () => {
            withController({ cacheEncryptionKey }, async ({ controller }) => {
              const currentState = await controller.createNewVaultAndRestore(
                password,
                uint8ArraySeed,
              );
              expect(currentState.encryptionKey).toBeDefined();
              expect(currentState.encryptionSalt).toBeDefined();
            });
          });
      }),
    );
  });

  describe('createNewVaultAndKeychain', () => {
    [false, true].map((cacheEncryptionKey) =>
      describe(`when cacheEncryptionKey is ${cacheEncryptionKey}`, () => {
        describe('when there is no existing vault', () => {
          it('should create new vault, mnemonic and keychain', async () => {
            await withController(
              { cacheEncryptionKey },
              async ({ controller, initialState, preferences, encryptor }) => {
                const cleanKeyringController = new KeyringController(
                  preferences,
                  buildKeyringControllerMessenger(),
                  { cacheEncryptionKey, encryptor },
                );
                const initialSeedWord = await controller.exportSeedPhrase(
                  password,
                );
                const currentState =
                  await cleanKeyringController.createNewVaultAndKeychain(
                    password,
                  );
                const currentSeedWord =
                  await cleanKeyringController.exportSeedPhrase(password);
                expect(initialSeedWord).toBeDefined();
                expect(initialState).not.toBe(currentState);
                expect(currentSeedWord).toBeDefined();
                expect(initialSeedWord).not.toBe(currentSeedWord);
                expect(
                  isValidHexAddress(currentState.keyrings[0].accounts[0]),
                ).toBe(true);
                expect(controller.state.vault).toBeDefined();
              },
            );
          });

          it('should set default state', async () => {
            await withController(async ({ controller }) => {
              expect(controller.state.keyrings).not.toStrictEqual([]);
              const keyring = controller.state.keyrings[0];
              expect(keyring.accounts).not.toStrictEqual([]);
              expect(keyring.type).toStrictEqual('HD Key Tree');
              expect(controller.state.vault).toBeDefined();
            });
          });
        });

        describe('when there is an existing vault', () => {
          it('should return existing vault', async () => {
            await withController(
              { cacheEncryptionKey },
              async ({ controller, initialState }) => {
                const initialSeedWord = await controller.exportSeedPhrase(
                  password,
                );
                const initialVault = controller.state.vault;
                const currentState = await controller.createNewVaultAndKeychain(
                  password,
                );
                const currentSeedWord = await controller.exportSeedPhrase(
                  password,
                );
                expect(initialSeedWord).toBeDefined();
                expect(initialState).toBe(currentState);
                expect(currentSeedWord).toBeDefined();
                expect(initialSeedWord).toBe(currentSeedWord);
                expect(initialVault).toStrictEqual(controller.state.vault);
              },
            );
          });
        });

        cacheEncryptionKey &&
          it('should set encryptionKey and encryptionSalt in state', async () => {
            withController({ cacheEncryptionKey }, async ({ initialState }) => {
              expect(initialState.encryptionKey).toBeDefined();
              expect(initialState.encryptionSalt).toBeDefined();
            });
          });
      }),
    );
  });

  describe('setLocked', () => {
    it('should set locked correctly', async () => {
      await withController(async ({ controller }) => {
        expect(controller.isUnlocked()).toBe(true);
        controller.setLocked();
        expect(controller.isUnlocked()).toBe(false);
      });
    });
  });

  describe('exportSeedPhrase', () => {
    describe('when correct password is provided', () => {
      it('should export seed phrase', async () => {
        await withController(async ({ controller }) => {
          const seed = await controller.exportSeedPhrase(password);
          expect(seed).not.toBe('');
        });
      });
    });

    describe('when wrong password is provided', () => {
      it('should export seed phrase', async () => {
        await withController(async ({ controller, encryptor }) => {
          sinon
            .stub(encryptor, 'decrypt')
            .throws(new Error('Invalid password'));
          await expect(controller.exportSeedPhrase('')).rejects.toThrow(
            'Invalid password',
          );
        });
      });
    });
  });

  describe('exportAccount', () => {
    describe('when correct password is provided', () => {
      describe('when correct account is provided', () => {
        it('should export account', async () => {
          await withController(async ({ controller, initialState }) => {
            const account = initialState.keyrings[0].accounts[0];
            const newPrivateKey = await controller.exportAccount(
              password,
              account,
            );
            expect(newPrivateKey).not.toBe('');
          });
        });
      });

      describe('when wrong account is provided', () => {
        it('should throw error', async () => {
          await withController(async ({ controller }) => {
            await expect(
              controller.exportAccount(password, ''),
            ).rejects.toThrow(/^No keyring found for the requested account./u);
          });
        });
      });
    });

    describe('when wrong password is provided', () => {
      it('should throw error', async () => {
        await withController(
          async ({ controller, initialState, encryptor }) => {
            const account = initialState.keyrings[0].accounts[0];
            sinon
              .stub(encryptor, 'decrypt')
              .rejects(new Error('Invalid password'));

            await expect(controller.exportAccount('', account)).rejects.toThrow(
              'Invalid password',
            );

            await expect(
              controller.exportAccount('JUNK_VALUE', account),
            ).rejects.toThrow('Invalid password');
          },
        );
      });
    });
  });

  describe('getAccounts', () => {
    it('should get accounts', async () => {
      await withController(async ({ controller, initialState }) => {
        const initialAccount = initialState.keyrings[0].accounts;
        const accounts = await controller.getAccounts();
        expect(accounts).toStrictEqual(initialAccount);
      });
    });
  });

  describe('getKeyringForAccount', () => {
    describe('when existing account is provided', () => {
      it('should get correct keyring', async () => {
        await withController(async ({ controller }) => {
          const normalizedInitialAccounts =
            controller.state.keyrings[0].accounts.map(normalize);
          const keyring = (await controller.getKeyringForAccount(
            normalizedInitialAccounts[0],
          )) as KeyringObject;
          expect(keyring.type).toBe('HD Key Tree');
          expect(keyring.getAccounts()).toStrictEqual(
            normalizedInitialAccounts,
          );
        });
      });
    });

    describe('when non-existing account is provided', () => {
      it('should throw error', async () => {
        await withController(async ({ controller }) => {
          await expect(controller.getKeyringForAccount('0x0')).rejects.toThrow(
            'No keyring found for the requested account. Error info: There are keyrings, but none match the address',
          );
        });
      });
    });
  });

  describe('getKeyringsByType', () => {
    describe('when existing type is provided', () => {
      it('should return keyrings of the right type', async () => {
        await withController(async ({ controller }) => {
          const keyrings = controller.getKeyringsByType(
            KeyringTypes.hd,
          ) as KeyringObject[];
          expect(keyrings).toHaveLength(1);
          expect(keyrings[0].type).toBe(KeyringTypes.hd);
          expect(keyrings[0].getAccounts()).toStrictEqual(
            controller.state.keyrings[0].accounts.map(normalize),
          );
        });
      });
    });

    describe('when non existing type is provided', () => {
      it('should return an empty array', async () => {
        await withController(async ({ controller }) => {
          const keyrings = controller.getKeyringsByType('fake');
          expect(keyrings).toHaveLength(0);
        });
      });
    });
  });

  describe('importAccountWithStrategy', () => {
    describe('using strategy privateKey', () => {
      describe('when correct key is provided', () => {
        it('should import account', async () => {
          await withController(async ({ controller, initialState }) => {
            const address = '0x51253087e6f8358b5f10c0a94315d69db3357859';
            const newKeyring = {
              accounts: [address],
              type: 'Simple Key Pair',
            };
            const { keyringState, importedAccountAddress } =
              await controller.importAccountWithStrategy(
                AccountImportStrategy.privateKey,
                [privateKey],
              );
            const modifiedState = {
              ...initialState,
              keyrings: [initialState.keyrings[0], newKeyring],
            };
            expect(keyringState).toStrictEqual(modifiedState);
            expect(importedAccountAddress).toBe(address);
          });
        });

        it('should not select imported account', async () => {
          await withController(async ({ controller, preferences }) => {
            await controller.importAccountWithStrategy(
              AccountImportStrategy.privateKey,
              [privateKey],
            );
            expect(preferences.setSelectedAddress.called).toBe(false);
          });
        });
      });

      describe('when wrong key is provided', () => {
        it('should not import account', async () => {
          await withController(async ({ controller }) => {
            await expect(
              controller.importAccountWithStrategy(
                AccountImportStrategy.privateKey,
                [],
              ),
            ).rejects.toThrow('Cannot import an empty key.');

            await expect(
              controller.importAccountWithStrategy(
                AccountImportStrategy.privateKey,
                ['123'],
              ),
            ).rejects.toThrow(
              'Expected private key to be an Uint8Array with length 32',
            );

            await expect(
              controller.importAccountWithStrategy(
                AccountImportStrategy.privateKey,
                ['0xblahblah'],
              ),
            ).rejects.toThrow('Cannot import invalid private key.');

            await expect(
              controller.importAccountWithStrategy(
                AccountImportStrategy.privateKey,
                [privateKey.slice(1)],
              ),
            ).rejects.toThrow('Cannot import invalid private key.');
          });
        });
      });
    });

    describe('using strategy json', () => {
      describe('when correct data is provided', () => {
        it('should import account', async () => {
          await withController(async ({ controller, initialState }) => {
            const somePassword = 'holachao123';
            const address = '0xb97c80fab7a3793bbe746864db80d236f1345ea7';

            const { keyringState, importedAccountAddress } =
              await controller.importAccountWithStrategy(
                AccountImportStrategy.json,
                [input, somePassword],
              );

            const newKeyring = {
              accounts: [address],
              type: 'Simple Key Pair',
            };
            const modifiedState = {
              ...initialState,
              keyrings: [initialState.keyrings[0], newKeyring],
            };
            expect(keyringState).toStrictEqual(modifiedState);
            expect(importedAccountAddress).toBe(address);
          });
        });

        it('should not select imported account', async () => {
          await withController(async ({ controller, preferences }) => {
            const somePassword = 'holachao123';
            await controller.importAccountWithStrategy(
              AccountImportStrategy.json,
              [input, somePassword],
            );
            expect(preferences.setSelectedAddress.called).toBe(false);
          });
        });
      });

      describe('when wrong data is provided', () => {
        it('should not import account with empty json', async () => {
          await withController(async ({ controller }) => {
            const somePassword = 'holachao123';
            await expect(
              controller.importAccountWithStrategy(AccountImportStrategy.json, [
                '',
                somePassword,
              ]),
            ).rejects.toThrow('Unexpected end of JSON input');
          });
        });

        it('should not import account with wrong password', async () => {
          await withController(async ({ controller }) => {
            const somePassword = 'holachao12';

            await expect(
              controller.importAccountWithStrategy(AccountImportStrategy.json, [
                input,
                somePassword,
              ]),
            ).rejects.toThrow(
              'Key derivation failed - possibly wrong passphrase',
            );
          });
        });

        it('should not import account with empty password', async () => {
          await withController(async ({ controller }) => {
            await expect(
              controller.importAccountWithStrategy(AccountImportStrategy.json, [
                input,
                '',
              ]),
            ).rejects.toThrow(
              'Key derivation failed - possibly wrong passphrase',
            );
          });
        });
      });
    });

    describe('using unrecognized strategy', () => {
      it('should throw an unexpected import strategy error', async () => {
        await withController(async ({ controller }) => {
          const somePassword = 'holachao123';
          await expect(
            controller.importAccountWithStrategy(
              'junk' as AccountImportStrategy,
              [input, somePassword],
            ),
          ).rejects.toThrow("Unexpected import strategy: 'junk'");
        });
      });
    });
  });

  describe('removeAccount', () => {
    /**
     * If there is only HD Key Tree keyring with 1 account and removeAccount is called passing that account
     * It deletes keyring object also from state - not sure if this is correct behavior.
     * https://github.com/MetaMask/core/issues/801
     */
    it('should remove HD Key Tree keyring from state when single account associated with it is deleted', async () => {
      await withController(async ({ controller, initialState }) => {
        const account = initialState.keyrings[0].accounts[0];
        const finalState = await controller.removeAccount(account);
        expect(finalState.keyrings).toHaveLength(0);
      });
    });

    it('should remove account', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.importAccountWithStrategy(
          AccountImportStrategy.privateKey,
          [privateKey],
        );
        const finalState = await controller.removeAccount(
          '0x51253087e6f8358b5f10c0a94315d69db3357859',
        );
        expect(finalState).toStrictEqual(initialState);
      });
    });

    it('should not remove account if wrong address is provided', async () => {
      await withController(async ({ controller }) => {
        await controller.importAccountWithStrategy(
          AccountImportStrategy.privateKey,
          [privateKey],
        );

        await expect(controller.removeAccount('')).rejects.toThrow(
          /^No keyring found for the requested account/u,
        );

        await expect(controller.removeAccount('DUMMY_INPUT')).rejects.toThrow(
          /^No keyring found for the requested account/u,
        );
      });
    });
  });

  describe('signMessage', () => {
    it('should sign message', async () => {
      await withController(async ({ controller, initialState }) => {
        const data =
          '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0';
        const account = initialState.keyrings[0].accounts[0];
        const signature = await controller.signMessage({
          data,
          from: account,
        });
        expect(signature).not.toBe('');
      });
    });

    it('should not sign message if empty data is passed', async () => {
      await withController(async ({ controller, initialState }) => {
        await expect(() =>
          controller.signMessage({
            data: '',
            from: initialState.keyrings[0].accounts[0],
          }),
        ).toThrow("Can't sign an empty message");
      });
    });

    it('should not sign message if from account is not passed', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.signMessage({
            data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
            from: '',
          }),
        ).rejects.toThrow(
          'No keyring found for the requested account. Error info: The address passed in is invalid/empty',
        );
      });
    });
  });

  describe('signPersonalMessage', () => {
    it('should sign personal message', async () => {
      await withController(async ({ controller, initialState }) => {
        const data = bufferToHex(Buffer.from('Hello from test', 'utf8'));
        const account = initialState.keyrings[0].accounts[0];
        const signature = await controller.signPersonalMessage({
          data,
          from: account,
        });
        const recovered = recoverPersonalSignature({ data, signature });
        expect(account).toBe(recovered);
      });
    });

    /**
     * signPersonalMessage does not fail for empty data value
     * https://github.com/MetaMask/core/issues/799
     */
    it('should sign personal message even if empty data is passed', async () => {
      await withController(async ({ controller, initialState }) => {
        const account = initialState.keyrings[0].accounts[0];
        const signature = await controller.signPersonalMessage({
          data: '',
          from: account,
        });
        const recovered = recoverPersonalSignature({ data: '', signature });
        expect(account).toBe(recovered);
      });
    });

    it('should not sign personal message if from account is not passed', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.signPersonalMessage({
            data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
            from: '',
          }),
        ).rejects.toThrow(
          'No keyring found for the requested account. Error info: The address passed in is invalid/empty',
        );
      });
    });
  });

  describe('signTypedMessage', () => {
    it('should throw when given invalid version', async () => {
      await withController(
        { keyringBuilders: [keyringBuilderFactory(QRKeyring)] },
        async ({ controller, initialState }) => {
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
            controller.signTypedMessage(
              { data: typedMsgParams, from: account },
              'junk' as SignTypedDataVersion,
            ),
          ).rejects.toThrow(
            "Keyring Controller signTypedMessage: Error: Unexpected signTypedMessage version: 'junk'",
          );
        },
      );
    });

    it('should sign typed message V1', async () => {
      await withController(
        { keyringBuilders: [keyringBuilderFactory(QRKeyring)] },
        async ({ controller, initialState }) => {
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
          const signature = await controller.signTypedMessage(
            { data: typedMsgParams, from: account },
            SignTypedDataVersion.V1,
          );
          const recovered = recoverTypedSignature({
            data: typedMsgParams,
            signature,
            version: SignTypedDataVersion.V1,
          });
          expect(account).toBe(recovered);
        },
      );
    });

    it('should sign typed message V3', async () => {
      await withController(
        { keyringBuilders: [keyringBuilderFactory(QRKeyring)] },
        async ({ controller, initialState }) => {
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
            primaryType: 'Mail' as const,
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
          const signature = await controller.signTypedMessage(
            { data: JSON.stringify(msgParams), from: account },
            SignTypedDataVersion.V3,
          );
          const recovered = recoverTypedSignature({
            data: msgParams,
            signature,
            version: SignTypedDataVersion.V3,
          });
          expect(account).toBe(recovered);
        },
      );
    });

    it('should sign typed message V4', async () => {
      await withController(
        { keyringBuilders: [keyringBuilderFactory(QRKeyring)] },
        async ({ controller, initialState }) => {
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
            primaryType: 'Mail' as const,
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
          const signature = await controller.signTypedMessage(
            { data: JSON.stringify(msgParams), from: account },
            SignTypedDataVersion.V4,
          );
          const recovered = recoverTypedSignature({
            data: msgParams,
            signature,
            version: SignTypedDataVersion.V4,
          });
          expect(account).toBe(recovered);
        },
      );
    });

    it('should fail when sign typed message format is wrong', async () => {
      await withController(async ({ controller, initialState }) => {
        const msgParams = [{}];
        const account = initialState.keyrings[0].accounts[0];

        await expect(
          controller.signTypedMessage(
            { data: msgParams, from: account },
            SignTypedDataVersion.V1,
          ),
        ).rejects.toThrow('Keyring Controller signTypedMessage:');

        await expect(
          controller.signTypedMessage(
            { data: msgParams, from: account },
            SignTypedDataVersion.V3,
          ),
        ).rejects.toThrow('Keyring Controller signTypedMessage:');
      });
    });

    it('should fail in signing message when from address is not provided', async () => {
      await withController(async ({ controller }) => {
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
        await expect(
          controller.signTypedMessage(
            { data: typedMsgParams, from: '' },
            SignTypedDataVersion.V1,
          ),
        ).rejects.toThrow(/^Keyring Controller signTypedMessage:/u);
      });
    });
  });

  describe('signTransaction', () => {
    it('should sign transaction', async () => {
      await withController(async ({ controller, initialState }) => {
        const account = initialState.keyrings[0].accounts[0];
        const txParams = {
          chainId: 5,
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
        const signedTx = await controller.signTransaction(
          unsignedEthTx,
          account,
        );
        expect(signedTx.v).not.toBeUndefined();
        expect(signedTx).not.toBe('');
      });
    });

    it('should not sign transaction if from account is not provided', async () => {
      await withController(async ({ controller, initialState }) => {
        await expect(async () => {
          const account = initialState.keyrings[0].accounts[0];
          const txParams = {
            chainId: 5,
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
          await controller.signTransaction(unsignedEthTx, '');
        }).rejects.toThrow(
          'No keyring found for the requested account. Error info: The address passed in is invalid/empty',
        );
      });
    });

    /**
     * Task added to improve check for valid transaction in signTransaction method
     * https://github.com/MetaMask/core/issues/800
     */
    it('should not sign transaction if transaction is not valid', async () => {
      await withController(async ({ controller, initialState }) => {
        await expect(async () => {
          const account = initialState.keyrings[0].accounts[0];
          await controller.signTransaction({}, account);
        }).rejects.toThrow('tx.sign is not a function');
      });
    });
  });

  describe('submitPassword', () => {
    [false, true].map((cacheEncryptionKey) =>
      describe(`when cacheEncryptionKey is ${cacheEncryptionKey}`, () => {
        it('should submit password and decrypt', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller, initialState }) => {
              const recoveredState = await controller.submitPassword(password);
              expect(recoveredState).toStrictEqual(initialState);
            },
          );
        });

        cacheEncryptionKey &&
          it('should set encryptionKey and encryptionSalt in state', async () => {
            withController({ cacheEncryptionKey }, async ({ controller }) => {
              const recoveredState = await controller.submitPassword(password);
              expect(recoveredState.encryptionKey).toBeDefined();
              expect(recoveredState.encryptionSalt).toBeDefined();
            });
          });
      }),
    );
  });

  describe('submitEncryptionKey', () => {
    it('should submit encryption key and decrypt', async () => {
      await withController(
        { cacheEncryptionKey: true },
        async ({ controller, initialState }) => {
          const recoveredState = await controller.submitEncryptionKey(
            mockKey.toString('hex'),
            initialState.encryptionSalt as string,
          );
          expect(recoveredState).toStrictEqual(initialState);
        },
      );
    });
  });

  describe('onLock', () => {
    it('should receive lock event', async () => {
      await withController(async ({ controller }) => {
        const listenerLock = sinon.stub();
        controller.onLock(listenerLock);
        await controller.setLocked();
        expect(listenerLock.called).toBe(true);
      });
    });
  });

  describe('onUnlock', () => {
    it('should receive unlock event', async () => {
      await withController(async ({ controller }) => {
        const listenerUnlock = sinon.stub();
        controller.onUnlock(listenerUnlock);
        await controller.submitPassword(password);
        expect(listenerUnlock.called).toBe(true);
      });
    });
  });

  describe('verifySeedPhrase', () => {
    it('should return current seedphrase', async () => {
      await withController(async ({ controller }) => {
        const seedPhrase = await controller.verifySeedPhrase();
        expect(seedPhrase).toBeDefined();
      });
    });

    it('should return current seedphrase as Uint8Array', async () => {
      await withController(async ({ controller }) => {
        const seedPhrase = await controller.verifySeedPhrase();
        expect(seedPhrase).toBeInstanceOf(Uint8Array);
      });
    });
  });

  describe('verifyPassword', () => {
    describe('when correct password is provided', () => {
      it('should not throw any error', async () => {
        await withController(async ({ controller }) => {
          expect(async () => {
            await controller.verifyPassword(password);
          }).not.toThrow();
        });
      });
    });

    describe('when wrong password is provided', () => {
      it('should throw an error', async () => {
        await withController(async ({ controller, encryptor }) => {
          sinon
            .stub(encryptor, 'decrypt')
            .rejects(new Error('Incorrect password'));

          await expect(controller.verifyPassword('12341234')).rejects.toThrow(
            'Incorrect password',
          );
        });
      });
    });
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

    let requestSignatureStub: sinon.SinonStub;
    let readAccountSub: sinon.SinonStub;

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
      signProcessKeyringController = await withController(
        { keyringBuilders: [keyringBuilderFactory(QRKeyring)] },
        ({ controller }) => controller,
      );
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

    describe('connectQRHardware', () => {
      it('should setup QR keyring with crypto-hdkey', async () => {
        readAccountSub.resolves(
          CryptoHDKey.fromCBOR(
            Buffer.from(
              'a902f40358210219218eb65839d08bde4338640b03fdbbdec439ef880d397c2f881282c5b5d135045820e65ed63f52e3e93d48ffb55cd68c6721e58ead9b29b784b8aba58354f4a3d92905d90131a201183c020006d90130a30186182cf5183cf500f5021a5271c071030307d90130a2018400f480f40300081a625f3e6209684b657973746f6e650a706163636f756e742e7374616e64617264',
              'hex',
            ),
          ),
        );

        const firstPage = await signProcessKeyringController.connectQRHardware(
          0,
        );
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
    });

    describe('signMessage', () => {
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
    });

    describe('signPersonalMessage', () => {
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
        const signature =
          await signProcessKeyringController.signPersonalMessage({
            data,
            from: account,
          });
        const recovered = recoverPersonalSignature({ data, signature });
        expect(account.toLowerCase()).toBe(recovered.toLowerCase());
      });
    });

    describe('signTypedMessage', () => {
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
        const recovered = recoverTypedSignature({
          data: typedMsgParams,
          signature,
          version: SignTypedDataVersion.V1,
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
          signature,
          version: SignTypedDataVersion.V3,
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
        const recovered = recoverTypedSignature({
          data: JSON.parse(msg),
          signature,
          version: SignTypedDataVersion.V4,
        });
        expect(account.toLowerCase()).toBe(recovered);
      });
    });

    describe('signTransaction', () => {
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
            chainId: '0x5',
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
              NetworkType.mainnet,
              {
                name: 'goerli',
                chainId: parseInt('5'),
                networkId: parseInt('5'),
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
    });

    describe('resetQRKeyringState', () => {
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
          (await signProcessKeyringController.getQRKeyringState()).getState()
            .sign.request,
        ).toBeDefined();

        await signProcessKeyringController.resetQRKeyringState();

        expect(
          (await signProcessKeyringController.getQRKeyringState()).getState()
            .sign.request,
        ).toBeUndefined();
      });
    });

    describe('forgetQRDevice', () => {
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
    });

    describe('restoreQRKeyring', () => {
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
        await signProcessKeyringController.restoreQRKeyring(
          serializedQRKeyring,
        );
        expect(
          signProcessKeyringController.state.keyrings[1].accounts,
        ).toHaveLength(1);
      });
    });

    describe('getAccountKeyringType', () => {
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
    });

    describe('submitQRCryptoHDKey', () => {
      it("should call qr keyring's method", async () => {
        await setupQRKeyring();
        const qrKeyring =
          await signProcessKeyringController.getOrAddQRKeyring();

        const submitCryptoHDKeyStub = sinon.stub(
          qrKeyring,
          'submitCryptoHDKey',
        );
        submitCryptoHDKeyStub.resolves();
        await signProcessKeyringController.submitQRCryptoHDKey('anything');
        expect(submitCryptoHDKeyStub.calledWith('anything')).toBe(true);
      });
    });

    describe('submitQRCryptoAccount', () => {
      it("should call qr keyring's method", async () => {
        await setupQRKeyring();
        const qrKeyring =
          await signProcessKeyringController.getOrAddQRKeyring();

        const submitCryptoAccountStub = sinon.stub(
          qrKeyring,
          'submitCryptoAccount',
        );
        submitCryptoAccountStub.resolves();
        await signProcessKeyringController.submitQRCryptoAccount('anything');
        expect(submitCryptoAccountStub.calledWith('anything')).toBe(true);
      });
    });

    describe('submitQRSignature', () => {
      it("should call qr keyring's method", async () => {
        await setupQRKeyring();
        const qrKeyring =
          await signProcessKeyringController.getOrAddQRKeyring();

        const submitSignatureStub = sinon.stub(qrKeyring, 'submitSignature');
        submitSignatureStub.resolves();
        await signProcessKeyringController.submitQRSignature(
          'anything',
          'anything',
        );
        expect(submitSignatureStub.calledWith('anything', 'anything')).toBe(
          true,
        );
      });
    });

    describe('cancelQRSignRequest', () => {
      it("should call qr keyring's method", async () => {
        await setupQRKeyring();
        const qrKeyring =
          await signProcessKeyringController.getOrAddQRKeyring();

        const cancelSignRequestStub = sinon.stub(
          qrKeyring,
          'cancelSignRequest',
        );
        cancelSignRequestStub.resolves();
        await signProcessKeyringController.cancelQRSignRequest();
        expect(cancelSignRequestStub.called).toBe(true);
      });
    });

    describe('cancelQRSynchronization', () => {
      it('should call `cancelSync` on the QR keyring', async () => {
        await setupQRKeyring();
        const qrKeyring =
          await signProcessKeyringController.getOrAddQRKeyring();

        const cancelSyncRequestStub = sinon.stub(qrKeyring, 'cancelSync');
        cancelSyncRequestStub.resolves();
        await signProcessKeyringController.cancelQRSynchronization();
        expect(cancelSyncRequestStub.called).toBe(true);
      });
    });
  });
});

type WithControllerCallback<ReturnValue> = ({
  controller,
  preferences,
  initialState,
  encryptor,
  messenger,
}: {
  controller: KeyringController;
  preferences: {
    setAccountLabel: sinon.SinonStub;
    removeIdentity: sinon.SinonStub;
    syncIdentities: sinon.SinonStub;
    updateIdentities: sinon.SinonStub;
    setSelectedAddress: sinon.SinonStub;
  };
  encryptor: MockEncryptor;
  initialState: KeyringControllerState;
  messenger: KeyringControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = Partial<KeyringControllerConfig>;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Build a controller messenger that includes all events used by the keyring
 * controller.
 *
 * @returns The controller messenger.
 */
function buildMessenger() {
  return new ControllerMessenger<never, KeyringControllerEvents>();
}

/**
 * Build a restricted controller messenger for the keyring controller.
 *
 * @param messenger - A controller messenger.
 * @returns The keyring controller restricted messenger.
 */
function buildKeyringControllerMessenger(messenger = buildMessenger()) {
  return messenger.getRestricted({
    name: 'KeyringController',
    allowedActions: [],
    allowedEvents: ['KeyringController:stateChange'],
  });
}

/**
 * Builds a controller based on the given options and creates a new vault
 * and keychain, then calls the given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag is equivalent to the options that KeyringController takes;
 * the function will be called with the built controller, along with its
 * preferences, encryptor and initial state.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const encryptor = new MockEncryptor();
  const preferences = {
    setAccountLabel: sinon.stub(),
    removeIdentity: sinon.stub(),
    syncIdentities: sinon.stub(),
    updateIdentities: sinon.stub(),
    setSelectedAddress: sinon.stub(),
  };
  const messenger = buildKeyringControllerMessenger();
  const controller = new KeyringController(preferences, messenger, {
    encryptor,
    cacheEncryptionKey: false,
    ...rest,
  });
  const initialState = await controller.createNewVaultAndKeychain(password);
  return await fn({
    controller,
    preferences,
    encryptor,
    initialState,
    messenger,
  });
}
