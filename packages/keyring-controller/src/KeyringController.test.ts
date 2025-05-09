import { Chain, Common, Hardfork } from '@ethereumjs/common';
import type { TypedTxData } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { CryptoHDKey, ETHSignature } from '@keystonehq/bc-ur-registry-eth';
import { MetaMaskKeyring as QRKeyring } from '@keystonehq/metamask-airgapped-keyring';
import { Messenger } from '@metamask/base-controller';
import { HdKeyring } from '@metamask/eth-hd-keyring';
import {
  normalize,
  recoverPersonalSignature,
  recoverTypedSignature,
  SignTypedDataVersion,
  encrypt,
  recoverEIP7702Authorization,
} from '@metamask/eth-sig-util';
import SimpleKeyring from '@metamask/eth-simple-keyring';
import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { KeyringClass } from '@metamask/keyring-utils';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';
import { bytesToHex, isValidHexAddress, type Hex } from '@metamask/utils';
import * as sinon from 'sinon';
import * as uuid from 'uuid';

import { KeyringControllerError } from './constants';
import type {
  KeyringControllerEvents,
  KeyringControllerMessenger,
  KeyringControllerState,
  KeyringControllerOptions,
  KeyringControllerActions,
} from './KeyringController';
import {
  AccountImportStrategy,
  KeyringController,
  KeyringTypes,
  isCustodyKeyring,
  keyringBuilderFactory,
} from './KeyringController';
import MockEncryptor, {
  MOCK_ENCRYPTION_KEY,
} from '../tests/mocks/mockEncryptor';
import { MockErc4337Keyring } from '../tests/mocks/mockErc4337Keyring';
import { MockKeyring } from '../tests/mocks/mockKeyring';
import MockShallowGetAccountsKeyring from '../tests/mocks/mockShallowGetAccountsKeyring';
import { buildMockTransaction } from '../tests/mocks/mockTransaction';

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

const commonConfig = { chain: Chain.Goerli, hardfork: Hardfork.Berlin };

describe('KeyringController', () => {
  afterEach(() => {
    sinon.restore();
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should use the default encryptor if none is provided', async () => {
      expect(
        () =>
          new KeyringController({
            messenger: buildKeyringControllerMessenger(),
            cacheEncryptionKey: true,
          }),
      ).not.toThrow();
    });

    it('should throw error if cacheEncryptionKey is true and encryptor does not support key export', () => {
      expect(
        () =>
          // @ts-expect-error testing an invalid encryptor
          new KeyringController({
            messenger: buildKeyringControllerMessenger(),
            cacheEncryptionKey: true,
            encryptor: { encrypt: jest.fn(), decrypt: jest.fn() },
          }),
      ).toThrow(KeyringControllerError.UnsupportedEncryptionKeyExport);
    });

    it('allows overwriting the built-in Simple keyring builder', async () => {
      const mockSimpleKeyringBuilder =
        // todo: keyring types are mismatched, this should be fixed in they keyrings themselves
        // @ts-expect-error keyring types are mismatched
        buildKeyringBuilderWithSpy(SimpleKeyring);
      await withController(
        { keyringBuilders: [mockSimpleKeyringBuilder] },
        async ({ controller }) => {
          await controller.addNewKeyring(KeyringTypes.simple);

          expect(mockSimpleKeyringBuilder).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('allows overwriting the built-in HD keyring builder', async () => {
      // todo: keyring types are mismatched, this should be fixed in they keyrings themselves
      // @ts-expect-error keyring types are mismatched
      const mockHdKeyringBuilder = buildKeyringBuilderWithSpy(HdKeyring);
      await withController(
        { keyringBuilders: [mockHdKeyringBuilder] },
        async () => {
          // This is called as part of initializing the controller
          // because the first keyring is assumed to always be an HD keyring
          expect(mockHdKeyringBuilder).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('allows removing a keyring builder without bricking the wallet when metadata was already generated', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: 'my vault',
          },
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
            {
              type: KeyringTypes.hd,
              data: '',
              metadata: { id: 'hd', name: '' },
            },
            {
              type: 'Unsupported',
              data: '',
              metadata: { id: 'unsupported', name: '' },
            },
            {
              type: KeyringTypes.hd,
              data: '',
              metadata: { id: 'hd2', name: '' },
            },
          ]);

          await controller.submitPassword(password);

          expect(controller.state.keyrings).toHaveLength(2);
          expect(controller.state.keyrings[0].type).toBe(KeyringTypes.hd);
          expect(controller.state.keyrings[0].metadata).toStrictEqual({
            id: 'hd',
            name: '',
          });
          expect(controller.state.keyrings[1].type).toBe(KeyringTypes.hd);
          expect(controller.state.keyrings[1].metadata).toStrictEqual({
            id: 'hd2',
            name: '',
          });
        },
      );
    });

    it('allows removing a keyring builder without bricking the wallet when metadata was not yet generated', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: 'my vault',
          },
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
            {
              type: 'HD Key Tree',
              data: '',
              metadata: { id: 'hd', name: '' },
            },
            {
              type: 'HD Key Tree',
              data: '',
              metadata: { id: 'hd2', name: '' },
            },
            // This keyring was already unsupported
            // (no metadata, and is at the end of the array)
            {
              type: MockKeyring.type,
              data: 'unsupported',
            },
          ]);

          await controller.submitPassword(password);

          expect(controller.state.keyrings).toHaveLength(2);
          expect(controller.state.keyrings[0].type).toBe(KeyringTypes.hd);
          expect(controller.state.keyrings[0].metadata).toStrictEqual({
            id: 'hd',
            name: '',
          });
          expect(controller.state.keyrings[1].type).toBe(KeyringTypes.hd);
          expect(controller.state.keyrings[1].metadata).toStrictEqual({
            id: 'hd2',
            name: '',
          });
        },
      );
    });
  });

  describe('addNewAccount', () => {
    describe('when accountCount is not provided', () => {
      it('should add new account', async () => {
        await withController(async ({ controller, initialState }) => {
          const addedAccountAddress = await controller.addNewAccount();
          expect(initialState.keyrings).toHaveLength(1);
          expect(initialState.keyrings[0].accounts).not.toStrictEqual(
            controller.state.keyrings[0].accounts,
          );
          expect(controller.state.keyrings[0].accounts).toHaveLength(2);
          expect(initialState.keyrings[0].accounts).not.toContain(
            addedAccountAddress,
          );
          expect(addedAccountAddress).toBe(
            controller.state.keyrings[0].accounts[1],
          );
        });
      });
    });

    describe('when accountCount is provided', () => {
      it('should add new account if accountCount is in sequence', async () => {
        await withController(async ({ controller, initialState }) => {
          const addedAccountAddress = await controller.addNewAccount(
            initialState.keyrings[0].accounts.length,
          );
          expect(initialState.keyrings).toHaveLength(1);
          expect(initialState.keyrings[0].accounts).not.toStrictEqual(
            controller.state.keyrings[0].accounts,
          );
          expect(controller.state.keyrings[0].accounts).toHaveLength(2);
          expect(initialState.keyrings[0].accounts).not.toContain(
            addedAccountAddress,
          );
          expect(addedAccountAddress).toBe(
            controller.state.keyrings[0].accounts[1],
          );
        });
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
          const firstAccountAdded =
            await controller.addNewAccount(accountCount);
          const secondAccountAdded =
            await controller.addNewAccount(accountCount);
          expect(firstAccountAdded).toBe(secondAccountAdded);
          expect(controller.state.keyrings[0].accounts).toHaveLength(
            accountCount + 1,
          );
        });
      });

      it('should throw an error if there is no primary keyring', async () => {
        await withController(
          { skipVaultCreation: true, state: { vault: 'my vault' } },
          async ({ controller, encryptor }) => {
            jest
              .spyOn(encryptor, 'decrypt')
              .mockResolvedValueOnce([{ type: 'Unsupported', data: '' }]);
            await controller.submitPassword('123');

            await expect(controller.addNewAccount()).rejects.toThrow(
              'No HD keyring found',
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.addNewAccount()).rejects.toThrow(
          KeyringControllerError.ControllerLocked,
        );
      });
    });

    // Testing fix for bug #4157 {@link https://github.com/MetaMask/core/issues/4157}
    it('should return an existing HD account if the accountCount is lower than oldAccounts', async () => {
      const mockAddress = '0x123';
      stubKeyringClassWithAccount(MockKeyring, mockAddress);
      await withController(
        { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
        async ({ controller, initialState }) => {
          await controller.addNewKeyring(MockKeyring.type);

          // expect there to be two accounts, 1 from HD and 1 from MockKeyring
          expect(await controller.getAccounts()).toHaveLength(2);

          const accountCount = initialState.keyrings[0].accounts.length;
          // We add a new account for "index 1" (not existing yet)
          const firstAccountAdded =
            await controller.addNewAccount(accountCount);
          // Adding an account for an existing index will return the existing account's address
          const secondAccountAdded =
            await controller.addNewAccount(accountCount);
          expect(firstAccountAdded).toBe(secondAccountAdded);
          expect(controller.state.keyrings[0].accounts).toHaveLength(
            accountCount + 1,
          );
          expect(await controller.getAccounts()).toHaveLength(3);
        },
      );
    });

    it('should throw instead of returning undefined', async () => {
      await withController(async ({ controller }) => {
        jest.spyOn(controller, 'getKeyringsByType').mockReturnValueOnce([
          {
            getAccounts: () => [undefined, undefined],
          },
        ]);

        await expect(controller.addNewAccount(1)).rejects.toThrow(
          "Can't find account at index 1",
        );
      });
    });

    it('should throw error if the account is duplicated', async () => {
      const mockAddress = '0x123';
      const addAccountsSpy = jest.spyOn(HdKeyring.prototype, 'addAccounts');
      const getAccountsSpy = jest.spyOn(HdKeyring.prototype, 'getAccounts');
      const serializeSpy = jest.spyOn(HdKeyring.prototype, 'serialize');

      addAccountsSpy.mockResolvedValue([mockAddress]);
      getAccountsSpy.mockReturnValue([mockAddress]);
      await withController(async ({ controller }) => {
        getAccountsSpy.mockReturnValue([mockAddress, mockAddress]);
        serializeSpy
          .mockResolvedValueOnce({
            mnemonic: '',
            numberOfAccounts: 1,
            hdPath: "m/44'/60'/0'/0",
          })
          .mockResolvedValueOnce({
            mnemonic: '',
            numberOfAccounts: 2,
            hdPath: "m/44'/60'/0'/0",
          });
        await expect(controller.addNewAccount()).rejects.toThrow(
          KeyringControllerError.DuplicatedAccount,
        );
      });
    });
  });

  describe('addNewAccountForKeyring', () => {
    describe('when accountCount is not provided', () => {
      it('should add new account', async () => {
        await withController(async ({ controller, initialState }) => {
          const [primaryKeyring] = controller.getKeyringsByType(
            KeyringTypes.hd,
          ) as EthKeyring[];
          const addedAccountAddress =
            await controller.addNewAccountForKeyring(primaryKeyring);
          expect(initialState.keyrings).toHaveLength(1);
          expect(initialState.keyrings[0].accounts).not.toStrictEqual(
            controller.state.keyrings[0].accounts,
          );
          expect(controller.state.keyrings[0].accounts).toHaveLength(2);
          expect(initialState.keyrings[0].accounts).not.toContain(
            addedAccountAddress,
          );
          expect(addedAccountAddress).toBe(
            controller.state.keyrings[0].accounts[1],
          );
        });
      });

      it('should not throw when `keyring.getAccounts()` returns a shallow copy', async () => {
        await withController(
          {
            keyringBuilders: [
              keyringBuilderFactory(MockShallowGetAccountsKeyring),
            ],
          },
          async ({ controller }) => {
            await controller.addNewKeyring(MockShallowGetAccountsKeyring.type);
            // TODO: This is a temporary workaround while `addNewAccountForKeyring` is not
            // removed.
            const mockKeyring = controller.getKeyringsByType(
              MockShallowGetAccountsKeyring.type,
            )[0] as EthKeyring;

            jest
              .spyOn(mockKeyring, 'serialize')
              .mockResolvedValueOnce({ numberOfAccounts: 1 })
              .mockResolvedValueOnce({ numberOfAccounts: 2 });

            const addedAccountAddress =
              await controller.addNewAccountForKeyring(mockKeyring);

            expect(controller.state.keyrings).toHaveLength(2);
            expect(controller.state.keyrings[1].accounts).toHaveLength(1);
            expect(addedAccountAddress).toBe(
              controller.state.keyrings[1].accounts[0],
            );
          },
        );
      });
    });

    describe('when accountCount is provided', () => {
      it('should add new account if accountCount is in sequence', async () => {
        await withController(async ({ controller, initialState }) => {
          const [primaryKeyring] = controller.getKeyringsByType(
            KeyringTypes.hd,
          ) as EthKeyring[];
          const addedAccountAddress =
            await controller.addNewAccountForKeyring(primaryKeyring);
          expect(initialState.keyrings).toHaveLength(1);
          expect(initialState.keyrings[0].accounts).not.toStrictEqual(
            controller.state.keyrings[0].accounts,
          );
          expect(controller.state.keyrings[0].accounts).toHaveLength(2);
          expect(initialState.keyrings[0].accounts).not.toContain(
            addedAccountAddress,
          );
          expect(addedAccountAddress).toBe(
            controller.state.keyrings[0].accounts[1],
          );
        });
      });

      it('should throw an error if passed accountCount param is out of sequence', async () => {
        await withController(async ({ controller, initialState }) => {
          const [primaryKeyring] = controller.getKeyringsByType(
            KeyringTypes.hd,
          ) as EthKeyring[];
          const accountCount = initialState.keyrings[0].accounts.length;
          await expect(
            controller.addNewAccountForKeyring(
              primaryKeyring,
              accountCount + 1,
            ),
          ).rejects.toThrow('Account out of sequence');
        });
      });

      it('should not add a new account if called twice with the same accountCount param', async () => {
        await withController(async ({ controller, initialState }) => {
          const accountCount = initialState.keyrings[0].accounts.length;
          const [primaryKeyring] = controller.getKeyringsByType(
            KeyringTypes.hd,
          ) as EthKeyring[];
          const firstAccountAdded = await controller.addNewAccountForKeyring(
            primaryKeyring,
            accountCount,
          );
          const secondAccountAdded = await controller.addNewAccountForKeyring(
            primaryKeyring,
            accountCount,
          );
          expect(firstAccountAdded).toBe(secondAccountAdded);
          expect(controller.state.keyrings[0].accounts).toHaveLength(
            accountCount + 1,
          );
        });
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        const keyring = controller.getKeyringsByType(KeyringTypes.hd)[0];
        await controller.setLocked();

        await expect(
          controller.addNewAccountForKeyring(keyring as EthKeyring),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('addNewKeyring', () => {
    describe('when there is a builder for the given type', () => {
      it('should add new keyring', async () => {
        await withController(async ({ controller, initialState }) => {
          const initialKeyrings = initialState.keyrings;
          await controller.addNewKeyring(KeyringTypes.simple);
          expect(controller.state.keyrings).not.toStrictEqual(initialKeyrings);
          expect(controller.state.keyrings).toHaveLength(2);
        });
      });

      it('should return a readonly object as metadata', async () => {
        await withController(async ({ controller }) => {
          const newMetadata = await controller.addNewKeyring(KeyringTypes.hd);

          expect(() => {
            newMetadata.name = 'new name';
          }).toThrow(/Cannot assign to read only property 'name'/u);
        });
      });
    });

    describe('when there is no builder for the given type', () => {
      it('should throw error', async () => {
        await withController(async ({ controller }) => {
          await expect(controller.addNewKeyring('fake')).rejects.toThrow(
            'KeyringController - No keyringBuilder found for keyring. Keyring type: fake',
          );
        });
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.addNewKeyring(KeyringTypes.hd)).rejects.toThrow(
          KeyringControllerError.ControllerLocked,
        );
      });
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
              const initialKeyrings = controller.state.keyrings;
              await controller.createNewVaultAndRestore(
                password,
                uint8ArraySeed,
              );
              expect(controller.state).not.toBe(initialState);
              expect(controller.state.vault).toBeDefined();
              expect(controller.state.vault).toStrictEqual(initialVault);
              expect(controller.state.keyrings).toHaveLength(
                initialKeyrings.length,
              );
              // new keyring metadata should be generated
              expect(controller.state.keyrings).not.toStrictEqual(
                initialKeyrings,
              );
            },
          );
        });

        it('should call encryptor.encrypt with the same keyrings if old seedWord is used', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller, encryptor }) => {
              const encryptSpy = jest.spyOn(encryptor, 'encrypt');
              const serializedKeyring = await controller.withKeyring(
                { type: 'HD Key Tree' },
                async ({ keyring }) => keyring.serialize(),
              );
              const currentSeedWord =
                await controller.exportSeedPhrase(password);

              await controller.createNewVaultAndRestore(
                password,
                currentSeedWord,
              );

              expect(encryptSpy).toHaveBeenCalledWith(password, [
                {
                  data: serializedKeyring,
                  type: 'HD Key Tree',
                  metadata: {
                    id: expect.any(String),
                    name: '',
                  },
                },
              ]);
            },
          );
        });

        it('should throw error if creating new vault and restore without password', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller }) => {
              await expect(
                controller.createNewVaultAndRestore('', uint8ArraySeed),
              ).rejects.toThrow(KeyringControllerError.InvalidEmptyPassword);
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
            await withController(
              { cacheEncryptionKey },
              async ({ controller }) => {
                await controller.createNewVaultAndRestore(
                  password,
                  uint8ArraySeed,
                );
                expect(controller.state.encryptionKey).toBeDefined();
                expect(controller.state.encryptionSalt).toBeDefined();
              },
            );
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
              { cacheEncryptionKey, skipVaultCreation: true },
              async ({ controller }) => {
                await controller.createNewVaultAndKeychain(password);

                const currentSeedPhrase =
                  await controller.exportSeedPhrase(password);

                expect(currentSeedPhrase.length).toBeGreaterThan(0);
                expect(
                  isValidHexAddress(
                    controller.state.keyrings[0].accounts[0] as Hex,
                  ),
                ).toBe(true);
                expect(controller.state.vault).toBeDefined();
              },
            );
          });

          cacheEncryptionKey &&
            it('should set encryptionKey and encryptionSalt in state', async () => {
              await withController(
                { cacheEncryptionKey, skipVaultCreation: true },
                async ({ controller }) => {
                  await controller.createNewVaultAndKeychain(password);

                  expect(controller.state.encryptionKey).toBeDefined();
                  expect(controller.state.encryptionSalt).toBeDefined();
                },
              );
            });

          it('should set default state', async () => {
            await withController(
              { cacheEncryptionKey, skipVaultCreation: true },
              async ({ controller }) => {
                await controller.createNewVaultAndKeychain(password);

                expect(controller.state.keyrings).not.toStrictEqual([]);
                const keyring = controller.state.keyrings[0];
                expect(keyring.accounts).not.toStrictEqual([]);
                expect(keyring.type).toBe('HD Key Tree');
                expect(controller.state.vault).toBeDefined();
              },
            );
          });

          it('should throw error if password is of wrong type', async () => {
            await withController(
              { cacheEncryptionKey, skipVaultCreation: true },
              async ({ controller }) => {
                await expect(
                  controller.createNewVaultAndKeychain(
                    // @ts-expect-error invalid password
                    123,
                  ),
                ).rejects.toThrow(KeyringControllerError.WrongPasswordType);
              },
            );
          });

          it('should throw error if the first account is not found on the keyring', async () => {
            jest.spyOn(HdKeyring.prototype, 'getAccounts').mockReturnValue([]);
            await withController(
              { cacheEncryptionKey, skipVaultCreation: true },
              async ({ controller }) => {
                await expect(
                  controller.createNewVaultAndKeychain(password),
                ).rejects.toThrow(KeyringControllerError.NoFirstAccount);
              },
            );
          });

          !cacheEncryptionKey &&
            it('should not set encryptionKey and encryptionSalt in state', async () => {
              await withController(
                { skipVaultCreation: true },
                async ({ controller }) => {
                  await controller.createNewVaultAndKeychain(password);

                  expect(controller.state).not.toHaveProperty('encryptionKey');
                  expect(controller.state).not.toHaveProperty('encryptionSalt');
                },
              );
            });
        });

        describe('when there is an existing vault', () => {
          it('should not create a new vault or keychain', async () => {
            await withController(
              { cacheEncryptionKey },
              async ({ controller, initialState }) => {
                const initialSeedWord =
                  await controller.exportSeedPhrase(password);
                expect(initialSeedWord).toBeDefined();
                const initialVault = controller.state.vault;

                await controller.createNewVaultAndKeychain(password);

                const currentSeedWord =
                  await controller.exportSeedPhrase(password);
                expect(initialState).toStrictEqual(controller.state);
                expect(initialSeedWord).toBe(currentSeedWord);
                expect(initialVault).toStrictEqual(controller.state.vault);
              },
            );
          });

          cacheEncryptionKey &&
            it('should set encryptionKey and encryptionSalt in state', async () => {
              await withController(
                { cacheEncryptionKey },
                async ({ controller }) => {
                  await controller.setLocked();
                  expect(controller.state.encryptionKey).toBeUndefined();
                  expect(controller.state.encryptionSalt).toBeUndefined();

                  await controller.createNewVaultAndKeychain(password);

                  expect(controller.state.encryptionKey).toBeDefined();
                  expect(controller.state.encryptionSalt).toBeDefined();
                },
              );
            });

          !cacheEncryptionKey &&
            it('should not set encryptionKey and encryptionSalt in state', async () => {
              await withController(
                { skipVaultCreation: false, cacheEncryptionKey },
                async ({ controller }) => {
                  await controller.createNewVaultAndKeychain(password);

                  expect(controller.state).not.toHaveProperty('encryptionKey');
                  expect(controller.state).not.toHaveProperty('encryptionSalt');
                },
              );
            });
        });
      }),
    );
  });

  describe('setLocked', () => {
    it('should set locked correctly', async () => {
      await withController(async ({ controller }) => {
        expect(controller.isUnlocked()).toBe(true);
        expect(controller.state.isUnlocked).toBe(true);

        await controller.setLocked();

        expect(controller.isUnlocked()).toBe(false);
        expect(controller.state.isUnlocked).toBe(false);
        expect(controller.state).not.toHaveProperty('encryptionKey');
        expect(controller.state).not.toHaveProperty('encryptionSalt');
      });
    });

    it('should emit KeyringController:lock event', async () => {
      await withController(async ({ controller, messenger }) => {
        const listener = sinon.spy();
        messenger.subscribe('KeyringController:lock', listener);
        await controller.setLocked();
        expect(listener.called).toBe(true);
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.setLocked()).rejects.toThrow(
          KeyringControllerError.ControllerLocked,
        );
      });
    });
  });

  describe('exportSeedPhrase', () => {
    describe('when mnemonic is not exportable', () => {
      it('should throw error', async () => {
        await withController(async ({ controller }) => {
          const primaryKeyring = controller.getKeyringsByType(
            KeyringTypes.hd,
          )[0] as EthKeyring & { mnemonic: string };

          primaryKeyring.mnemonic = '';

          await expect(controller.exportSeedPhrase(password)).rejects.toThrow(
            "Can't get mnemonic bytes from keyring",
          );
        });
      });
    });

    describe('when mnemonic is exportable', () => {
      describe('when correct password is provided', () => {
        it('should export seed phrase without keyringId', async () => {
          await withController(async ({ controller }) => {
            const seed = await controller.exportSeedPhrase(password);
            expect(seed).not.toBe('');
          });
        });

        it('should export seed phrase with valid keyringId', async () => {
          await withController(async ({ controller, initialState }) => {
            const keyringId = initialState.keyrings[0].metadata.id;
            const seed = await controller.exportSeedPhrase(password, keyringId);
            expect(seed).not.toBe('');
          });
        });

        it('should throw error if keyringId is invalid', async () => {
          await withController(async ({ controller }) => {
            await expect(
              controller.exportSeedPhrase(password, 'invalid-id'),
            ).rejects.toThrow('Keyring not found');
          });
        });
      });

      describe('when wrong password is provided', () => {
        it('should export seed phrase', async () => {
          await withController(async ({ controller, encryptor }) => {
            jest
              .spyOn(encryptor, 'decrypt')
              .mockRejectedValueOnce(new Error('Invalid password'));
            await expect(controller.exportSeedPhrase('')).rejects.toThrow(
              'Invalid password',
            );
          });
        });

        it('should throw invalid password error with valid keyringId', async () => {
          await withController(
            async ({ controller, encryptor, initialState }) => {
              const keyringId = initialState.keyrings[0].metadata.id;
              jest
                .spyOn(encryptor, 'decrypt')
                .mockRejectedValueOnce(new Error('Invalid password'));
              await expect(
                controller.exportSeedPhrase('', keyringId),
              ).rejects.toThrow('Invalid password');
            },
          );
        });
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.exportSeedPhrase(password)).rejects.toThrow(
          KeyringControllerError.ControllerLocked,
        );
      });
    });
  });

  describe('exportAccount', () => {
    describe('when the keyring for the given address supports exportAccount', () => {
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
              ).rejects.toThrow(
                'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
              );
            });
          });
        });
      });

      describe('when wrong password is provided', () => {
        it('should throw error', async () => {
          await withController(async ({ controller, encryptor }) => {
            jest
              .spyOn(encryptor, 'decrypt')
              .mockRejectedValueOnce(new Error('Invalid password'));
            await expect(controller.exportSeedPhrase('')).rejects.toThrow(
              'Invalid password',
            );
          });
        });
      });
    });
    describe('when the keyring for the given address does not support exportAccount', () => {
      it('should throw error', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);

            await expect(
              controller.exportAccount(password, address),
            ).rejects.toThrow(KeyringControllerError.UnsupportedExportAccount);
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

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.getAccounts()).rejects.toThrow(
          KeyringControllerError.ControllerLocked,
        );
      });
    });
  });

  describe('getEncryptionPublicKey', () => {
    describe('when the keyring for the given address supports getEncryptionPublicKey', () => {
      it('should return the correct encryption public key', async () => {
        await withController(async ({ controller }) => {
          const importedAccountAddress =
            await controller.importAccountWithStrategy(
              AccountImportStrategy.privateKey,
              [privateKey],
            );

          const encryptionPublicKey = await controller.getEncryptionPublicKey(
            importedAccountAddress,
          );

          expect(encryptionPublicKey).toBe(
            'ZfKqt4HSy4tt9/WvqP3QrnzbIS04cnV//BhksKbLgVA=',
          );
        });
      });
    });

    describe('when the keyring for the given address does not support getEncryptionPublicKey', () => {
      it('should throw error', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);

            await expect(
              controller.getEncryptionPublicKey(address),
            ).rejects.toThrow(
              KeyringControllerError.UnsupportedGetEncryptionPublicKey,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.getEncryptionPublicKey(
            initialState.keyrings[0].accounts[0],
          ),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('decryptMessage', () => {
    describe('when the keyring for the given address supports decryptMessage', () => {
      it('should successfully decrypt a message with valid parameters and return the raw decryption result', async () => {
        await withController(async ({ controller }) => {
          const importedAccountAddress =
            await controller.importAccountWithStrategy(
              AccountImportStrategy.privateKey,
              [privateKey],
            );
          const message = 'Hello, encrypted world!';
          const encryptedMessage = encrypt({
            publicKey: await controller.getEncryptionPublicKey(
              importedAccountAddress,
            ),
            data: message,
            version: 'x25519-xsalsa20-poly1305',
          });

          const messageParams = {
            from: importedAccountAddress,
            data: encryptedMessage,
          };

          const result = await controller.decryptMessage(messageParams);

          expect(result).toBe(message);
        });
      });

      it("should throw an error if the 'from' parameter is not a valid account address", async () => {
        await withController(async ({ controller }) => {
          const messageParams = {
            from: 'invalid address',
            data: {
              version: '1.0',
              nonce: '123456',
              ephemPublicKey: '0xabcdef1234567890',
              ciphertext: '0xabcdef1234567890',
            },
          };

          await expect(
            controller.decryptMessage(messageParams),
          ).rejects.toThrow(
            'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
          );
        });
      });
    });

    describe('when the keyring for the given address does not support decryptMessage', () => {
      it('should throw error', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);

            await expect(
              controller.decryptMessage({
                from: address,
                data: {
                  version: '1.0',
                  nonce: '123456',
                  ephemPublicKey: '0xabcdef1234567890',
                  ciphertext: '0xabcdef1234567890',
                },
              }),
            ).rejects.toThrow(KeyringControllerError.UnsupportedDecryptMessage);
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.decryptMessage({
            from: initialState.keyrings[0].accounts[0],
            data: {
              version: '1.0',
              nonce: '123456',
              ephemPublicKey: '0xabcdef1234567890',
              ciphertext: '0xabcdef1234567890',
            },
          }),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            normalizedInitialAccounts[0]!,
          )) as EthKeyring;
          expect(keyring.type).toBe('HD Key Tree');
          expect(keyring.getAccounts()).toStrictEqual(
            normalizedInitialAccounts,
          );
        });
      });
    });

    describe('when non-existing account is provided', () => {
      it('should throw error if no account matches the address', async () => {
        await withController(async ({ controller }) => {
          await expect(
            controller.getKeyringForAccount(
              '0x0000000000000000000000000000000000000000',
            ),
          ).rejects.toThrow(
            'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
          );
        });
      });

      it('should throw an error if there is no keyring', async () => {
        await withController(
          { skipVaultCreation: true, state: { vault: 'my vault' } },
          async ({ controller, encryptor }) => {
            jest
              .spyOn(encryptor, 'decrypt')
              .mockResolvedValueOnce([{ type: 'Unsupported', data: '' }]);
            await controller.submitPassword('123');

            await expect(
              controller.getKeyringForAccount(
                '0x0000000000000000000000000000000000000000',
              ),
            ).rejects.toThrow(
              'KeyringController - No keyring found. Error info: There are no keyrings',
            );
          },
        );
      });

      it('should throw an error if the controller is locked', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();

          await expect(
            controller.getKeyringForAccount(
              '0x51253087e6f8358b5f10c0a94315d69db3357859',
            ),
          ).rejects.toThrow(KeyringControllerError.ControllerLocked);
        });
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.getKeyringForAccount(initialState.keyrings[0].accounts[0]),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('getKeyringsByType', () => {
    describe('when existing type is provided', () => {
      it('should return keyrings of the right type', async () => {
        await withController(async ({ controller }) => {
          const keyrings = controller.getKeyringsByType(
            KeyringTypes.hd,
          ) as EthKeyring[];
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

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        expect(() => controller.getKeyringsByType(KeyringTypes.hd)).toThrow(
          KeyringControllerError.ControllerLocked,
        );
      });
    });
  });

  describe('persistAllKeyrings', () => {
    it('should reflect changes made directly to a keyring into the KeyringController state', async () => {
      await withController(async ({ controller }) => {
        const primaryKeyring = controller.getKeyringsByType(
          KeyringTypes.hd,
        )[0] as EthKeyring;
        const [addedAccount] = await primaryKeyring.addAccounts(1);

        await controller.persistAllKeyrings();

        expect(controller.state.keyrings[0].accounts[1]).toBe(addedAccount);
      });
    });

    it('should throw error when locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.persistAllKeyrings()).rejects.toThrow(
          KeyringControllerError.ControllerLocked,
        );
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
            const importedAccountAddress =
              await controller.importAccountWithStrategy(
                AccountImportStrategy.privateKey,
                [privateKey],
              );
            const modifiedState = {
              ...initialState,
              keyrings: [
                initialState.keyrings[0],
                {
                  ...newKeyring,
                  metadata: controller.state.keyrings[1].metadata,
                },
              ],
            };
            expect(controller.state).toStrictEqual(modifiedState);
            expect(importedAccountAddress).toBe(address);
          });
        });

        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line jest/expect-expect
        it('should not select imported account', async () => {
          await withController(async ({ controller }) => {
            await controller.importAccountWithStrategy(
              AccountImportStrategy.privateKey,
              [privateKey],
            );
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
            ).rejects.toThrow('Cannot import invalid private key.');

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

            const importedAccountAddress =
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
              keyrings: [
                initialState.keyrings[0],
                {
                  ...newKeyring,
                  metadata: controller.state.keyrings[1].metadata,
                },
              ],
            };
            expect(controller.state).toStrictEqual(modifiedState);
            expect(importedAccountAddress).toBe(address);
          });
        });

        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line jest/expect-expect
        it('should not select imported account', async () => {
          await withController(async ({ controller }) => {
            const somePassword = 'holachao123';
            await controller.importAccountWithStrategy(
              AccountImportStrategy.json,
              [input, somePassword],
            );
          });
        });

        it('should throw error when importing a duplicate account', async () => {
          await withController(async ({ controller }) => {
            const somePassword = 'holachao123';
            await controller.importAccountWithStrategy(
              AccountImportStrategy.json,
              [input, somePassword],
            );

            await expect(
              controller.importAccountWithStrategy(AccountImportStrategy.json, [
                input,
                somePassword,
              ]),
            ).rejects.toThrow(KeyringControllerError.DuplicatedAccount);
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

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(
          controller.importAccountWithStrategy(
            AccountImportStrategy.privateKey,
            [input, 'password'],
          ),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('removeAccount', () => {
    describe('when the keyring for the given address supports removeAccount', () => {
      /**
       * If there is only HD Key Tree keyring with 1 account and removeAccount is called passing that account
       * It deletes keyring object also from state - not sure if this is correct behavior.
       * https://github.com/MetaMask/core/issues/801
       *
       * Update: The behaviour is now modified to never remove the HD keyring as a preventive and temporal solution to the current race
       * condition case we have been seeing lately. https://github.com/MetaMask/mobile-planning/issues/1507
       * Enforcing this behaviour is not a 100% correct and it should be responsibility of the consumer to handle the accounts
       * and keyrings in a way that it matches the expected behaviour.
       */
      it('should not remove HD Key Tree keyring nor the single account from state', async () => {
        await withController(async ({ controller, initialState }) => {
          const account = initialState.keyrings[0].accounts[0] as Hex;
          await expect(controller.removeAccount(account)).rejects.toThrow(
            KeyringControllerError.LastAccountInPrimaryKeyring,
          );
          expect(controller.state.keyrings).toHaveLength(1);
          expect(controller.state.keyrings[0].accounts).toHaveLength(1);
        });
      });

      it('should not remove primary keyring if it has no accounts even if it has more than one HD keyring', async () => {
        await withController(async ({ controller }) => {
          await controller.addNewKeyring(KeyringTypes.hd);
          await expect(
            controller.removeAccount(controller.state.keyrings[0].accounts[0]),
          ).rejects.toThrow(KeyringControllerError.LastAccountInPrimaryKeyring);
        });
      });

      it('should remove account', async () => {
        await withController(async ({ controller, initialState }) => {
          await controller.importAccountWithStrategy(
            AccountImportStrategy.privateKey,
            [privateKey],
          );
          await controller.removeAccount(
            '0x51253087e6f8358b5f10c0a94315d69db3357859',
          );
          expect(controller.state).toStrictEqual(initialState);
        });
      });

      it('should emit `accountRemoved` event', async () => {
        await withController(async ({ controller, messenger }) => {
          await controller.importAccountWithStrategy(
            AccountImportStrategy.privateKey,
            [privateKey],
          );
          const listener = sinon.spy();
          messenger.subscribe('KeyringController:accountRemoved', listener);

          const removedAccount = '0x51253087e6f8358b5f10c0a94315d69db3357859';
          await controller.removeAccount(removedAccount);

          expect(listener.calledWith(removedAccount)).toBe(true);
        });
      });

      it('should not remove account if wrong address is provided', async () => {
        await withController(async ({ controller }) => {
          await controller.importAccountWithStrategy(
            AccountImportStrategy.privateKey,
            [privateKey],
          );

          await expect(
            controller.removeAccount(
              '0x0000000000000000000000000000000000000000',
            ),
          ).rejects.toThrow(
            'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
          );

          await expect(
            controller.removeAccount('0xDUMMY_INPUT'),
          ).rejects.toThrow(
            'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
          );
        });
      });

      it('should remove the keyring if last account is removed and its not primary keyring', async () => {
        await withController(async ({ controller }) => {
          await controller.addNewKeyring(KeyringTypes.hd);
          expect(controller.state.keyrings).toHaveLength(2);
          await controller.removeAccount(
            controller.state.keyrings[1].accounts[0],
          );
          expect(controller.state.keyrings).toHaveLength(1);
        });
      });
    });

    describe('when the keyring for the given address does not support removeAccount', () => {
      it('should throw error', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);

            await expect(controller.removeAccount(address)).rejects.toThrow(
              KeyringControllerError.UnsupportedRemoveAccount,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.removeAccount(initialState.keyrings[0].accounts[0]),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('signMessage', () => {
    describe('when the keyring for the given address supports signMessage', () => {
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
          ).rejects.toThrow("Can't sign an empty message");
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
            'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
          );
        });
      });
    });

    describe('when the keyring for the given address does not support signMessage', () => {
      it('should throw error', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);
            const inputParams = {
              from: address,
              data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
              origin: 'https://metamask.github.io',
            };

            await expect(controller.signMessage(inputParams)).rejects.toThrow(
              KeyringControllerError.UnsupportedSignMessage,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.signMessage({
            from: initialState.keyrings[0].accounts[0],
            data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
            origin: 'https://metamask.github.io',
          }),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('signPersonalMessage', () => {
    describe('when the keyring for the given address supports signPersonalMessage', () => {
      it('should sign personal message', async () => {
        await withController(async ({ controller, initialState }) => {
          const data = bytesToHex(Buffer.from('Hello from test', 'utf8'));
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
            'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
          );
        });
      });
    });

    describe('when the keyring for the given address does not support signPersonalMessage', () => {
      it('should throw error', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);
            const inputParams = {
              from: address,
              data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
              origin: 'https://metamask.github.io',
            };

            await expect(
              controller.signPersonalMessage(inputParams),
            ).rejects.toThrow(
              KeyringControllerError.UnsupportedSignPersonalMessage,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.signPersonalMessage({
            from: initialState.keyrings[0].accounts[0],
            data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
            origin: 'https://metamask.github.io',
          }),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('signEip7702Authorization', () => {
    const from = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
    stubKeyringClassWithAccount(MockKeyring, from);
    const chainId = 1;
    const contractAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
    const nonce = 1;

    describe('when the keyring for the given address supports signEip7702Authorization', () => {
      it('should sign EIP-7702 authorization message', async () => {
        await withController(async ({ controller, initialState }) => {
          const account = initialState.keyrings[0].accounts[0];
          const signature = await controller.signEip7702Authorization({
            from: account,
            chainId,
            contractAddress,
            nonce,
          });

          const recovered = recoverEIP7702Authorization({
            authorization: [chainId, contractAddress, nonce],
            signature,
          });

          expect(recovered).toBe(account);
        });
      });

      it('should not sign EIP-7702 authorization message if from account is not passed', async () => {
        await withController(async ({ controller }) => {
          await expect(
            controller.signEip7702Authorization({
              chainId,
              contractAddress,
              nonce,
              from: '',
            }),
          ).rejects.toThrow(
            'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
          );
        });
      });

      it.each([undefined, null])(
        'should throw error if contract address is %s',
        async (invalidContractAddress) => {
          await withController(async ({ controller, initialState }) => {
            const account = initialState.keyrings[0].accounts[0];
            await expect(
              controller.signEip7702Authorization({
                from: account,
                chainId,
                contractAddress: invalidContractAddress as unknown as string,
                nonce,
              }),
            ).rejects.toThrow(
              KeyringControllerError.MissingEip7702AuthorizationContractAddress,
            );
          });
        },
      );
    });

    describe('when the keyring for the given address does not support signEip7702Authorization', () => {
      it('should throw error', async () => {
        stubKeyringClassWithAccount(MockKeyring, from);

        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);

            await expect(
              controller.signEip7702Authorization({
                from,
                chainId,
                contractAddress,
                nonce,
              }),
            ).rejects.toThrow(
              KeyringControllerError.UnsupportedSignEip7702Authorization,
            );
          },
        );
      });
    });
  });

  describe('signTypedMessage', () => {
    describe('when the keyring for the given address supports signTypedMessage', () => {
      it('should throw when given invalid version', async () => {
        await withController(
          // @ts-expect-error QRKeyring is not yet compatible with Keyring type.
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
          // @ts-expect-error QRKeyring is not yet compatible with Keyring type.
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
          // @ts-expect-error QRKeyring is not yet compatible with Keyring type.
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
          // @ts-expect-error QRKeyring is not yet compatible with Keyring type.
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

    describe('when the keyring for the given address does not support signTypedMessage', () => {
      it('should throw error', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);
            const inputParams = {
              from: address,
              data: [
                {
                  type: 'string',
                  name: 'Message',
                  value: 'Hi, Alice!',
                },
                {
                  type: 'uint32',
                  name: 'A number',
                  value: '1337',
                },
              ],
              origin: 'https://metamask.github.io',
            };

            await expect(
              controller.signTypedMessage(inputParams, SignTypedDataVersion.V1),
            ).rejects.toThrow(
              KeyringControllerError.UnsupportedSignTypedMessage,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.signTypedMessage(
            {
              from: initialState.keyrings[0].accounts[0],
              data: [
                {
                  type: 'string',
                  name: 'Message',
                  value: 'Hi, Alice!',
                },
                {
                  type: 'uint32',
                  name: 'A number',
                  value: '1337',
                },
              ],
              origin: 'https://metamask.github.io',
            },
            SignTypedDataVersion.V1,
          ),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('signTransaction', () => {
    describe('when the keyring for the given address supports signTransaction', () => {
      it('should sign transaction', async () => {
        await withController(async ({ controller, initialState }) => {
          const account = initialState.keyrings[0].accounts[0];
          const txParams: TypedTxData = {
            chainId: 5,
            data: '0x1',
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
          expect(signedTx.v).toBeDefined();
          expect(signedTx).not.toBe('');
        });
      });

      it('should not sign transaction if from account is not provided', async () => {
        await withController(async ({ controller }) => {
          await expect(async () => {
            const txParams: TypedTxData = {
              chainId: 5,
              data: '0x1',
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
            'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
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
            // @ts-expect-error invalid transaction
            await controller.signTransaction({}, account);
          }).rejects.toThrow('tx.sign is not a function');
        });
      });
    });

    describe('when the keyring for the given address does not support signTransaction', () => {
      it('should throw if the keyring for the given address does not support signTransaction', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);

            await expect(
              controller.signTransaction(buildMockTransaction(), address),
            ).rejects.toThrow(
              KeyringControllerError.UnsupportedSignTransaction,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.signTransaction(
            buildMockTransaction(),
            initialState.keyrings[0].accounts[0],
          ),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('prepareUserOperation', () => {
    const chainId = '0x1';
    const executionContext = {
      chainId,
    };
    describe('when the keyring for the given address supports prepareUserOperation', () => {
      it('should prepare base user operation', async () => {
        const address = '0x660265edc169bab511a40c0e049cc1e33774443d';
        stubKeyringClassWithAccount(MockErc4337Keyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockErc4337Keyring)] },
          async ({ controller }) => {
            const { id } = await controller.addNewKeyring(
              MockErc4337Keyring.type,
            );
            const baseUserOp = {
              callData: '0x7064',
              initCode: '0x22ff',
              nonce: '0x1',
              gasLimits: {
                callGasLimit: '0x58a83',
                verificationGasLimit: '0xe8c4',
                preVerificationGas: '0xc57c',
              },
              dummySignature: '0x',
              dummyPaymasterAndData: '0x',
              bundlerUrl: 'https://bundler.example.com/rpc',
            };
            const baseTxs = [
              {
                to: '',
                value: '0x0',
                data: '0x7064',
              },
            ];
            await controller.withKeyring({ id }, async ({ keyring }) => {
              jest
                .spyOn(keyring, 'prepareUserOperation')
                .mockResolvedValueOnce(baseUserOp);

              const result = await controller.prepareUserOperation(
                address,
                baseTxs,
                executionContext,
              );

              expect(result).toStrictEqual(baseUserOp);
              expect(keyring.prepareUserOperation).toHaveBeenCalledTimes(1);
              expect(keyring.prepareUserOperation).toHaveBeenCalledWith(
                address,
                baseTxs,
                executionContext,
              );
            });
          },
        );
      });
    });

    describe('when the keyring for the given address does not support prepareUserOperation', () => {
      it('should throw error', async () => {
        const address = '0x660265edc169bab511a40c0e049cc1e33774443d';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);

            await expect(
              controller.prepareUserOperation(address, [], executionContext),
            ).rejects.toThrow(
              KeyringControllerError.UnsupportedPrepareUserOperation,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.prepareUserOperation(
            initialState.keyrings[0].accounts[0],
            [],
            executionContext,
          ),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('patchUserOperation', () => {
    const chainId = '0x1';
    const executionContext = {
      chainId,
    };

    describe('when the keyring for the given address supports patchUserOperation', () => {
      it('should patch an user operation', async () => {
        const address = '0x660265edc169bab511a40c0e049cc1e33774443d';
        stubKeyringClassWithAccount(MockErc4337Keyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockErc4337Keyring)] },
          async ({ controller }) => {
            const { id } = await controller.addNewKeyring(
              MockErc4337Keyring.type,
            );
            const userOp = {
              sender: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4',
              nonce: '0x1',
              initCode: '0x',
              callData: '0x7064',
              callGasLimit: '0x58a83',
              verificationGasLimit: '0xe8c4',
              preVerificationGas: '0xc57c',
              maxFeePerGas: '0x87f0878c0',
              maxPriorityFeePerGas: '0x1dcd6500',
              paymasterAndData: '0x',
              signature: '0x',
            };
            const patch = {
              paymasterAndData: '0x1234',
            };
            await controller.withKeyring({ id }, async ({ keyring }) => {
              jest
                .spyOn(keyring, 'patchUserOperation')
                .mockResolvedValueOnce(patch);

              const result = await controller.patchUserOperation(
                address,
                userOp,
                executionContext,
              );

              expect(result).toStrictEqual(patch);
              expect(keyring.patchUserOperation).toHaveBeenCalledTimes(1);
              expect(keyring.patchUserOperation).toHaveBeenCalledWith(
                address,
                userOp,
                executionContext,
              );
            });
          },
        );
      });
    });

    describe('when the keyring for the given address does not support patchUserOperation', () => {
      it('should throw error', async () => {
        const address = '0x660265edc169bab511a40c0e049cc1e33774443d';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);
            const userOp = {
              sender: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4',
              nonce: '0x1',
              initCode: '0x',
              callData: '0x7064',
              callGasLimit: '0x58a83',
              verificationGasLimit: '0xe8c4',
              preVerificationGas: '0xc57c',
              maxFeePerGas: '0x87f0878c0',
              maxPriorityFeePerGas: '0x1dcd6500',
              paymasterAndData: '0x',
              signature: '0x',
            };

            await expect(
              controller.patchUserOperation(address, userOp, executionContext),
            ).rejects.toThrow(
              KeyringControllerError.UnsupportedPatchUserOperation,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.patchUserOperation(
            initialState.keyrings[0].accounts[0],
            {
              sender: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4',
              nonce: '0x1',
              initCode: '0x',
              callData: '0x7064',
              callGasLimit: '0x58a83',
              verificationGasLimit: '0xe8c4',
              preVerificationGas: '0xc57c',
              maxFeePerGas: '0x87f0878c0',
              maxPriorityFeePerGas: '0x1dcd6500',
              paymasterAndData: '0x',
              signature: '0x',
            },
            executionContext,
          ),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('signUserOperation', () => {
    const chainId = '0x1';
    const executionContext = {
      chainId,
    };
    describe('when the keyring for the given address supports signUserOperation', () => {
      it('should sign an user operation', async () => {
        const address = '0x660265edc169bab511a40c0e049cc1e33774443d';
        stubKeyringClassWithAccount(MockErc4337Keyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockErc4337Keyring)] },
          async ({ controller }) => {
            const { id } = await controller.addNewKeyring(
              MockErc4337Keyring.type,
            );
            const userOp = {
              sender: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4',
              nonce: '0x1',
              initCode: '0x',
              callData: '0x7064',
              callGasLimit: '0x58a83',
              verificationGasLimit: '0xe8c4',
              preVerificationGas: '0xc57c',
              maxFeePerGas: '0x87f0878c0',
              maxPriorityFeePerGas: '0x1dcd6500',
              paymasterAndData: '0x',
              signature: '0x',
            };
            const signature = '0x1234';
            await controller.withKeyring({ id }, async ({ keyring }) => {
              jest
                .spyOn(keyring, 'signUserOperation')
                .mockResolvedValueOnce(signature);

              const result = await controller.signUserOperation(
                address,
                userOp,
                executionContext,
              );

              expect(result).toStrictEqual(signature);
              expect(keyring.signUserOperation).toHaveBeenCalledTimes(1);
              expect(keyring.signUserOperation).toHaveBeenCalledWith(
                address,
                userOp,
                executionContext,
              );
            });
          },
        );
      });
    });

    describe('when the keyring for the given address does not support signUserOperation', () => {
      it('should throw error', async () => {
        const address = '0x660265edc169bab511a40c0e049cc1e33774443d';
        stubKeyringClassWithAccount(MockKeyring, address);
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller }) => {
            await controller.addNewKeyring(MockKeyring.type);
            const userOp = {
              sender: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4',
              nonce: '0x1',
              initCode: '0x',
              callData: '0x7064',
              callGasLimit: '0x58a83',
              verificationGasLimit: '0xe8c4',
              preVerificationGas: '0xc57c',
              maxFeePerGas: '0x87f0878c0',
              maxPriorityFeePerGas: '0x1dcd6500',
              paymasterAndData: '0x',
              signature: '0x',
            };

            await expect(
              controller.signUserOperation(address, userOp, executionContext),
            ).rejects.toThrow(
              KeyringControllerError.UnsupportedSignUserOperation,
            );
          },
        );
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.signUserOperation(
            initialState.keyrings[0].accounts[0],
            {
              sender: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4',
              nonce: '0x1',
              initCode: '0x',
              callData: '0x7064',
              callGasLimit: '0x58a83',
              verificationGasLimit: '0xe8c4',
              preVerificationGas: '0xc57c',
              maxFeePerGas: '0x87f0878c0',
              maxPriorityFeePerGas: '0x1dcd6500',
              paymasterAndData: '0x',
              signature: '0x',
            },
            executionContext,
          ),
        ).rejects.toThrow(KeyringControllerError.ControllerLocked);
      });
    });
  });

  describe('changePassword', () => {
    [false, true].map((cacheEncryptionKey) =>
      describe(`when cacheEncryptionKey is ${cacheEncryptionKey}`, () => {
        it('should encrypt the vault with the new password', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller, encryptor }) => {
              const newPassword = 'new-password';
              const spiedEncryptionFn = jest.spyOn(
                encryptor,
                cacheEncryptionKey ? 'encryptWithDetail' : 'encrypt',
              );

              await controller.changePassword(newPassword);

              // we pick the first argument of the first call
              expect(spiedEncryptionFn.mock.calls[0][0]).toBe(newPassword);
            },
          );
        });

        it('should throw error if `isUnlocked` is false', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller }) => {
              await controller.setLocked();

              await expect(async () =>
                controller.changePassword(''),
              ).rejects.toThrow(KeyringControllerError.ControllerLocked);
            },
          );
        });

        it('should throw error if the new password is an empty string', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller }) => {
              await expect(controller.changePassword('')).rejects.toThrow(
                KeyringControllerError.InvalidEmptyPassword,
              );
            },
          );
        });

        it('should throw error if the new password is undefined', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller }) => {
              await expect(
                // @ts-expect-error we are testing wrong input
                controller.changePassword(undefined),
              ).rejects.toThrow(KeyringControllerError.WrongPasswordType);
            },
          );
        });

        it('should throw error when the controller is locked', async () => {
          await withController(async ({ controller }) => {
            await controller.setLocked();

            await expect(async () =>
              controller.changePassword('whatever'),
            ).rejects.toThrow(KeyringControllerError.ControllerLocked);
          });
        });
      }),
    );
  });

  describe('submitPassword', () => {
    [false, true].map((cacheEncryptionKey) =>
      describe(`when cacheEncryptionKey is ${cacheEncryptionKey}`, () => {
        it('should submit password and decrypt', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller, initialState }) => {
              await controller.submitPassword(password);
              expect(controller.state).toStrictEqual(initialState);
            },
          );
        });

        it('should emit KeyringController:unlock event', async () => {
          await withController(
            { cacheEncryptionKey },
            async ({ controller, messenger }) => {
              const listener = sinon.spy();
              messenger.subscribe('KeyringController:unlock', listener);
              await controller.submitPassword(password);
              expect(listener.called).toBe(true);
            },
          );
        });

        it('should unlock also with unsupported keyrings', async () => {
          await withController(
            {
              cacheEncryptionKey,
              skipVaultCreation: true,
              state: { vault: 'my vault' },
            },
            async ({ controller, encryptor }) => {
              jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                {
                  type: 'UnsupportedKeyring',
                  data: '0x1234',
                },
              ]);

              await controller.submitPassword(password);

              expect(controller.state.isUnlocked).toBe(true);
            },
          );
        });

        it('should throw error if vault unlocked has an unexpected shape', async () => {
          await withController(
            {
              cacheEncryptionKey,
              skipVaultCreation: true,
              state: { vault: 'my vault' },
            },
            async ({ controller, encryptor }) => {
              jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                {
                  foo: 'bar',
                },
              ]);

              await expect(controller.submitPassword(password)).rejects.toThrow(
                KeyringControllerError.VaultDataError,
              );
            },
          );
        });

        it('should throw error if vault is missing', async () => {
          await withController(
            { skipVaultCreation: true },
            async ({ controller }) => {
              await expect(controller.submitPassword(password)).rejects.toThrow(
                KeyringControllerError.VaultError,
              );
            },
          );
        });

        it('should unlock succesfully when the controller is instantiated with an existing `keyringsMetadata`', async () => {
          // @ts-expect-error HdKeyring is not yet compatible with Keyring type.
          stubKeyringClassWithAccount(HdKeyring, '0x123');
          await withController(
            {
              cacheEncryptionKey,
              state: { vault: 'my vault' },
              skipVaultCreation: true,
            },
            async ({ controller, encryptor }) => {
              jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                {
                  type: KeyringTypes.hd,
                  data: {
                    accounts: ['0x123'],
                  },
                  metadata: {
                    id: '123',
                    name: '',
                  },
                },
              ]);

              await controller.submitPassword(password);

              expect(controller.state.keyrings).toStrictEqual([
                {
                  type: KeyringTypes.hd,
                  accounts: ['0x123'],
                  metadata: {
                    id: '123',
                    name: '',
                  },
                },
              ]);
            },
          );
        });

        cacheEncryptionKey &&
          it('should generate new metadata when there is no metadata in the vault and cacheEncryptionKey is enabled', async () => {
            const hdKeyringSerializeSpy = jest.spyOn(
              HdKeyring.prototype,
              'serialize',
            );
            await withController(
              {
                cacheEncryptionKey: true,
                state: {
                  vault: 'my vault',
                },
                skipVaultCreation: true,
              },
              async ({ controller, encryptor }) => {
                const encryptWithKeySpy = jest.spyOn(
                  encryptor,
                  'encryptWithKey',
                );
                jest
                  .spyOn(encryptor, 'importKey')
                  // @ts-expect-error we are assigning a mock value
                  .mockResolvedValue('imported key');
                jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                  {
                    type: KeyringTypes.hd,
                    data: {
                      accounts: ['0x123'],
                    },
                  },
                ]);
                hdKeyringSerializeSpy.mockResolvedValue({
                  // @ts-expect-error we are assigning a mock value
                  accounts: ['0x123'],
                });

                await controller.submitPassword(password);

                expect(controller.state.keyrings).toStrictEqual([
                  {
                    type: KeyringTypes.hd,
                    accounts: expect.any(Array),
                    metadata: {
                      id: expect.any(String),
                      name: '',
                    },
                  },
                ]);
                expect(encryptWithKeySpy).toHaveBeenCalledWith('imported key', [
                  {
                    type: KeyringTypes.hd,
                    data: {
                      accounts: ['0x123'],
                    },
                    metadata: {
                      id: expect.any(String),
                      name: '',
                    },
                  },
                ]);
              },
            );
          });

        !cacheEncryptionKey &&
          it('should generate new metadata when there is no metadata in the vault and cacheEncryptionKey is disabled', async () => {
            const hdKeyringSerializeSpy = jest.spyOn(
              HdKeyring.prototype,
              'serialize',
            );
            await withController(
              {
                cacheEncryptionKey: false,
                state: {
                  vault: 'my vault',
                },
                skipVaultCreation: true,
              },
              async ({ controller, encryptor }) => {
                const encryptSpy = jest.spyOn(encryptor, 'encrypt');
                jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                  {
                    type: KeyringTypes.hd,
                    data: {
                      accounts: ['0x123'],
                    },
                  },
                ]);
                hdKeyringSerializeSpy.mockResolvedValue({
                  // @ts-expect-error we are assigning a mock value
                  accounts: ['0x123'],
                });

                await controller.submitPassword(password);

                expect(controller.state.keyrings).toStrictEqual([
                  {
                    type: KeyringTypes.hd,
                    accounts: expect.any(Array),
                    metadata: {
                      id: expect.any(String),
                      name: '',
                    },
                  },
                ]);
                expect(encryptSpy).toHaveBeenCalledWith(password, [
                  {
                    type: KeyringTypes.hd,
                    data: {
                      accounts: ['0x123'],
                    },
                    metadata: {
                      id: expect.any(String),
                      name: '',
                    },
                  },
                ]);
              },
            );
          });

        it('should unlock the wallet if the state has a duplicate account and the encryption parameters are outdated', async () => {
          stubKeyringClassWithAccount(MockKeyring, '0x123');
          // @ts-expect-error HdKeyring is not yet compatible with Keyring type.
          stubKeyringClassWithAccount(HdKeyring, '0x123');
          await withController(
            {
              skipVaultCreation: true,
              cacheEncryptionKey,
              state: { vault: 'my vault' },
              keyringBuilders: [keyringBuilderFactory(MockKeyring)],
            },
            async ({ controller, encryptor, messenger }) => {
              const unlockListener = jest.fn();
              messenger.subscribe('KeyringController:unlock', unlockListener);
              jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(false);
              jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                {
                  type: KeyringTypes.hd,
                  data: {},
                },
                {
                  type: MockKeyring.type,
                  data: {},
                },
              ]);

              await controller.submitPassword(password);

              expect(controller.state.isUnlocked).toBe(true);
              expect(unlockListener).toHaveBeenCalledTimes(1);
            },
          );
        });

        it('should unlock the wallet discarding existing duplicate accounts', async () => {
          stubKeyringClassWithAccount(MockKeyring, '0x123');
          // @ts-expect-error HdKeyring is not yet compatible with Keyring type.
          stubKeyringClassWithAccount(HdKeyring, '0x123');
          await withController(
            {
              skipVaultCreation: true,
              cacheEncryptionKey,
              state: { vault: 'my vault' },
              keyringBuilders: [keyringBuilderFactory(MockKeyring)],
            },
            async ({ controller, encryptor, messenger }) => {
              const unlockListener = jest.fn();
              messenger.subscribe('KeyringController:unlock', unlockListener);
              jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                {
                  type: KeyringTypes.hd,
                  data: {},
                },
                {
                  type: MockKeyring.type,
                  data: {},
                },
              ]);

              await controller.submitPassword(password);

              expect(controller.state.keyrings).toHaveLength(1);
            },
          );
        });

        cacheEncryptionKey &&
          it('should upgrade the vault encryption if the key encryptor has different parameters', async () => {
            await withController(
              {
                skipVaultCreation: true,
                cacheEncryptionKey,
                state: { vault: 'my vault' },
              },
              async ({ controller, encryptor }) => {
                jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(false);
                const encryptSpy = jest.spyOn(encryptor, 'encrypt');
                jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                  {
                    type: KeyringTypes.hd,
                    data: {
                      accounts: ['0x123'],
                    },
                  },
                ]);

                await controller.submitPassword(password);

                expect(encryptSpy).toHaveBeenCalledTimes(1);
              },
            );
          });

        cacheEncryptionKey &&
          it('should not upgrade the vault encryption if the key encryptor has the same parameters', async () => {
            await withController(
              {
                skipVaultCreation: true,
                cacheEncryptionKey,
                state: { vault: 'my vault' },
              },
              async ({ controller, encryptor }) => {
                jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(true);
                const encryptSpy = jest.spyOn(encryptor, 'encrypt');
                jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                  {
                    type: KeyringTypes.hd,
                    data: {
                      accounts: ['0x123'],
                    },
                  },
                ]);

                await controller.submitPassword(password);

                expect(encryptSpy).not.toHaveBeenCalled();
              },
            );
          });

        !cacheEncryptionKey &&
          it('should upgrade the vault encryption if the generic encryptor has different parameters', async () => {
            await withController(
              {
                skipVaultCreation: true,
                cacheEncryptionKey,
                state: { vault: 'my vault' },
              },
              async ({ controller, encryptor }) => {
                jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(false);
                const encryptSpy = jest.spyOn(encryptor, 'encrypt');
                jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                  {
                    type: KeyringTypes.hd,
                    data: {
                      accounts: ['0x123'],
                    },
                  },
                ]);

                await controller.submitPassword(password);

                expect(encryptSpy).toHaveBeenCalledTimes(1);
              },
            );
          });

        it('should not upgrade the vault encryption if the encryptor has the same parameters and the keyring has metadata', async () => {
          await withController(
            {
              skipVaultCreation: true,
              cacheEncryptionKey,
              state: { vault: 'my vault' },
            },
            async ({ controller, encryptor }) => {
              jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(true);
              const encryptSpy = jest.spyOn(encryptor, 'encrypt');
              jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
                {
                  type: KeyringTypes.hd,
                  data: {
                    accounts: ['0x123'],
                  },
                  metadata: {
                    id: '123',
                    name: '',
                  },
                },
              ]);

              await controller.submitPassword(password);

              expect(encryptSpy).not.toHaveBeenCalled();
            },
          );
        });

        !cacheEncryptionKey &&
          it('should throw error if password is of wrong type', async () => {
            await withController(
              { cacheEncryptionKey },
              async ({ controller }) => {
                await expect(
                  // @ts-expect-error we are testing the case of a user using
                  // the wrong password type
                  controller.submitPassword(12341234),
                ).rejects.toThrow(KeyringControllerError.WrongPasswordType);
              },
            );
          });

        cacheEncryptionKey &&
          it('should set encryptionKey and encryptionSalt in state', async () => {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            withController({ cacheEncryptionKey }, async ({ controller }) => {
              await controller.submitPassword(password);
              expect(controller.state.encryptionKey).toBeDefined();
              expect(controller.state.encryptionSalt).toBeDefined();
            });
          });

        it('should throw error when using the wrong password', async () => {
          await withController(
            {
              skipVaultCreation: true,
              cacheEncryptionKey,
              state: { vault: 'my vault' },
            },
            async ({ controller }) => {
              await expect(
                controller.submitPassword('wrong password'),
              ).rejects.toThrow('Incorrect password.');
            },
          );
        });
      }),
    );
  });

  describe('submitEncryptionKey', () => {
    it('should submit encryption key and decrypt', async () => {
      await withController(
        { cacheEncryptionKey: true },
        async ({ controller, initialState }) => {
          await controller.submitEncryptionKey(
            MOCK_ENCRYPTION_KEY,
            initialState.encryptionSalt as string,
          );
          expect(controller.state).toStrictEqual(initialState);
        },
      );
    });

    it('should unlock also with unsupported keyrings', async () => {
      await withController(
        {
          cacheEncryptionKey: true,
          skipVaultCreation: true,
          state: {
            vault: JSON.stringify({ data: '0x123', salt: 'my salt' }),
            // @ts-expect-error we want to force the controller to have an
            // encryption salt equal to the one in the vault
            encryptionSalt: 'my salt',
          },
        },
        async ({ controller, initialState, encryptor }) => {
          jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
            {
              type: 'UnsupportedKeyring',
              data: '0x1234',
            },
          ]);

          await controller.submitEncryptionKey(
            MOCK_ENCRYPTION_KEY,
            initialState.encryptionSalt as string,
          );

          expect(controller.state.isUnlocked).toBe(true);
        },
      );
    });

    it('should update the vault if new metadata is created while unlocking', async () => {
      jest.spyOn(HdKeyring.prototype, 'serialize').mockResolvedValue({
        // @ts-expect-error we are assigning a mock value
        accounts: ['0x123'],
      });
      await withController(
        {
          cacheEncryptionKey: true,
          skipVaultCreation: true,
          state: {
            vault: JSON.stringify({ data: '0x123', salt: 'my salt' }),
            // @ts-expect-error we want to force the controller to have an
            // encryption salt equal to the one in the vault
            encryptionSalt: 'my salt',
          },
        },
        async ({ controller, initialState, encryptor }) => {
          const encryptWithKeySpy = jest.spyOn(encryptor, 'encryptWithKey');
          jest
            .spyOn(encryptor, 'importKey')
            // @ts-expect-error we are assigning a mock value
            .mockResolvedValue('imported key');
          jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
            {
              type: KeyringTypes.hd,
              data: '0x123',
            },
          ]);

          await controller.submitEncryptionKey(
            MOCK_ENCRYPTION_KEY,
            initialState.encryptionSalt as string,
          );

          expect(controller.state.isUnlocked).toBe(true);
          expect(encryptWithKeySpy).toHaveBeenCalledWith('imported key', [
            {
              type: KeyringTypes.hd,
              data: {
                accounts: ['0x123'],
              },
              metadata: {
                id: expect.any(String),
                name: '',
              },
            },
          ]);
        },
      );
    });

    it('should throw error if vault unlocked has an unexpected shape', async () => {
      await withController(
        { cacheEncryptionKey: true },
        async ({ controller, initialState, encryptor }) => {
          jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce([
            {
              foo: 'bar',
            },
          ]);

          await expect(
            controller.submitEncryptionKey(
              MOCK_ENCRYPTION_KEY,
              initialState.encryptionSalt as string,
            ),
          ).rejects.toThrow(KeyringControllerError.VaultDataError);
        },
      );
    });

    it('should throw error if encryptionSalt is different from the one in the vault', async () => {
      await withController(
        { cacheEncryptionKey: true },
        async ({ controller }) => {
          await expect(
            controller.submitEncryptionKey(MOCK_ENCRYPTION_KEY, '0x1234'),
          ).rejects.toThrow(KeyringControllerError.ExpiredCredentials);
        },
      );
    });

    it('should throw error if encryptionKey is of an unexpected type', async () => {
      await withController(
        { cacheEncryptionKey: true },
        async ({ controller, initialState }) => {
          await expect(
            controller.submitEncryptionKey(
              // @ts-expect-error we are testing the case of a user using
              // the wrong encryptionKey type
              12341234,
              initialState.encryptionSalt as string,
            ),
          ).rejects.toThrow(KeyringControllerError.WrongPasswordType);
        },
      );
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

    it('should return seedphrase for a specific keyring', async () => {
      await withController(async ({ controller }) => {
        const seedPhrase = await controller.verifySeedPhrase(
          controller.state.keyrings[0].metadata.id,
        );
        expect(seedPhrase).toBeDefined();
      });
    });

    it('should throw if mnemonic is not defined', async () => {
      await withController(async ({ controller }) => {
        const primaryKeyring = controller.getKeyringsByType(
          KeyringTypes.hd,
        )[0] as EthKeyring & { mnemonic: string };

        primaryKeyring.mnemonic = '';

        await expect(controller.verifySeedPhrase()).rejects.toThrow(
          "Can't get mnemonic bytes from keyring",
        );
      });
    });

    it('should throw error if the controller is locked', async () => {
      await withController(
        { skipVaultCreation: true },
        async ({ controller }) => {
          await expect(controller.verifySeedPhrase()).rejects.toThrow(
            KeyringControllerError.ControllerLocked,
          );
        },
      );
    });

    it('should throw unsupported seed phrase error when keyring is not HD', async () => {
      await withController(async ({ controller }) => {
        await controller.addNewKeyring(KeyringTypes.simple, [privateKey]);

        const keyringId = controller.state.keyrings[1].metadata.id;
        await expect(controller.verifySeedPhrase(keyringId)).rejects.toThrow(
          KeyringControllerError.UnsupportedVerifySeedPhrase,
        );
      });
    });

    it('should throw an error if there is no primary keyring', async () => {
      await withController(
        { skipVaultCreation: true, state: { vault: 'my vault' } },
        async ({ controller, encryptor }) => {
          jest
            .spyOn(encryptor, 'decrypt')
            .mockResolvedValueOnce([{ type: 'Unsupported', data: '' }]);
          await controller.submitPassword('123');

          await expect(controller.verifySeedPhrase()).rejects.toThrow(
            KeyringControllerError.KeyringNotFound,
          );
        },
      );
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.verifySeedPhrase()).rejects.toThrow(
          KeyringControllerError.ControllerLocked,
        );
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

      it('should throw error if vault is missing', async () => {
        await withController(
          { skipVaultCreation: true },
          async ({ controller }) => {
            await expect(controller.verifyPassword(password)).rejects.toThrow(
              KeyringControllerError.VaultError,
            );
          },
        );
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

      it('should throw error if vault is missing', async () => {
        await withController(
          { skipVaultCreation: true },
          async ({ controller }) => {
            await expect(controller.verifyPassword('123')).rejects.toThrow(
              KeyringControllerError.VaultError,
            );
          },
        );
      });
    });
  });

  describe('withKeyring', () => {
    it('should rollback if an error is thrown', async () => {
      await withController(async ({ controller, initialState }) => {
        const selector = { type: KeyringTypes.hd };
        const fn = async ({ keyring }: { keyring: EthKeyring }) => {
          await keyring.addAccounts(1);
          throw new Error('Oops');
        };

        await expect(controller.withKeyring(selector, fn)).rejects.toThrow(
          'Oops',
        );

        expect(controller.state.keyrings[0].accounts).toHaveLength(1);
        expect(await controller.getAccounts()).toStrictEqual(
          initialState.keyrings[0].accounts,
        );
      });
    });

    describe('when the keyring is selected by type', () => {
      it('should call the given function with the selected keyring', async () => {
        await withController(async ({ controller }) => {
          const fn = jest.fn();
          const selector = { type: KeyringTypes.hd };
          const keyring = controller.getKeyringsByType(KeyringTypes.hd)[0];
          const { metadata } = controller.state.keyrings[0];

          await controller.withKeyring(selector, fn);

          expect(fn).toHaveBeenCalledWith({ keyring, metadata });
        });
      });

      it('should return the result of the function', async () => {
        await withController(async ({ controller }) => {
          const fn = async () => Promise.resolve('hello');
          const selector = { type: KeyringTypes.hd };

          expect(await controller.withKeyring(selector, fn)).toBe('hello');
        });
      });

      it('should throw an error if the callback returns the selected keyring', async () => {
        await withController(async ({ controller }) => {
          await expect(
            controller.withKeyring(
              { type: KeyringTypes.hd },
              async ({ keyring }) => {
                return keyring;
              },
            ),
          ).rejects.toThrow(KeyringControllerError.UnsafeDirectKeyringAccess);
        });
      });

      describe('when the keyring is not found', () => {
        it('should throw an error if the keyring is not found and `createIfMissing` is false', async () => {
          await withController(async ({ controller }) => {
            const selector = { type: 'foo' };
            const fn = jest.fn();

            await expect(controller.withKeyring(selector, fn)).rejects.toThrow(
              KeyringControllerError.KeyringNotFound,
            );
            expect(fn).not.toHaveBeenCalled();
          });
        });

        it('should add the keyring if `createIfMissing` is true', async () => {
          await withController(
            { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
            async ({ controller }) => {
              const selector = { type: MockKeyring.type };
              const fn = jest.fn();

              await controller.withKeyring(selector, fn, {
                createIfMissing: true,
              });

              expect(fn).toHaveBeenCalled();
              expect(controller.state.keyrings).toHaveLength(2);
            },
          );
        });

        it('should update the vault if the keyring is being updated', async () => {
          const mockAddress = '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4';
          stubKeyringClassWithAccount(MockKeyring, mockAddress);
          await withController(
            { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
            async ({ controller, messenger }) => {
              const selector = { type: MockKeyring.type };

              await controller.addNewKeyring(MockKeyring.type);
              const serializeSpy = jest.spyOn(
                MockKeyring.prototype,
                'serialize',
              );
              serializeSpy.mockResolvedValueOnce({
                foo: 'bar', // Initial keyring state.
              });

              const mockStateChange = jest.fn();
              messenger.subscribe(
                'KeyringController:stateChange',
                mockStateChange,
              );

              await controller.withKeyring(selector, async () => {
                serializeSpy.mockResolvedValueOnce({
                  foo: 'zzz', // Mock keyring state change.
                });
              });

              expect(mockStateChange).toHaveBeenCalled();
            },
          );
        });

        it('should not update the vault if the keyring has not been updated', async () => {
          const mockAddress = '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4';
          stubKeyringClassWithAccount(MockKeyring, mockAddress);
          await withController(
            {
              keyringBuilders: [keyringBuilderFactory(MockKeyring)],
            },
            async ({ controller, messenger }) => {
              const selector = { type: MockKeyring.type };

              await controller.addNewKeyring(MockKeyring.type);
              const serializeSpy = jest.spyOn(
                MockKeyring.prototype,
                'serialize',
              );
              serializeSpy.mockResolvedValue({
                foo: 'bar', // Initial keyring state.
              });

              const mockStateChange = jest.fn();
              messenger.subscribe(
                'KeyringController:stateChange',
                mockStateChange,
              );

              await controller.withKeyring(selector, async () => {
                // No-op, keyring state won't be updated.
              });

              expect(mockStateChange).not.toHaveBeenCalled();
            },
          );
        });
      });
    });

    describe('when the keyring is selected by address', () => {
      it('should call the given function with the selected keyring', async () => {
        await withController(async ({ controller, initialState }) => {
          const fn = jest.fn();
          const selector = {
            address: initialState.keyrings[0].accounts[0] as Hex,
          };
          const keyring = controller.getKeyringsByType(KeyringTypes.hd)[0];
          const { metadata } = controller.state.keyrings[0];

          await controller.withKeyring(selector, fn);

          expect(fn).toHaveBeenCalledWith({ keyring, metadata });
        });
      });

      it('should return the result of the function', async () => {
        await withController(async ({ controller, initialState }) => {
          const fn = async () => Promise.resolve('hello');
          const selector = {
            address: initialState.keyrings[0].accounts[0] as Hex,
          };

          expect(await controller.withKeyring(selector, fn)).toBe('hello');
        });
      });

      describe('when the keyring is not found', () => {
        [true, false].forEach((value) =>
          it(`should throw an error if the createIfMissing is ${value}`, async () => {
            await withController(async ({ controller }) => {
              const selector = {
                address: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4' as Hex,
              };
              const fn = jest.fn();

              await expect(
                controller.withKeyring(selector, fn),
              ).rejects.toThrow(
                'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
              );
              expect(fn).not.toHaveBeenCalled();
            });
          }),
        );
      });
    });

    describe('when the keyring is selected by id', () => {
      it('should call the given function with the selected keyring', async () => {
        await withController(async ({ controller }) => {
          const fn = jest.fn();
          const keyring = controller.getKeyringsByType(KeyringTypes.hd)[0];
          const { metadata } = controller.state.keyrings[0];
          const selector = { id: metadata.id };

          await controller.withKeyring(selector, fn);

          expect(fn).toHaveBeenCalledWith({ keyring, metadata });
        });
      });

      it('should return the result of the function', async () => {
        await withController(async ({ controller, initialState }) => {
          const fn = async () => Promise.resolve('hello');
          const selector = { id: initialState.keyrings[0].metadata.id };

          expect(await controller.withKeyring(selector, fn)).toBe('hello');
        });
      });

      it('should throw an error if the callback returns the selected keyring', async () => {
        await withController(async ({ controller, initialState }) => {
          const selector = { id: initialState.keyrings[0].metadata.id };

          await expect(
            controller.withKeyring(selector, async ({ keyring }) => {
              return keyring;
            }),
          ).rejects.toThrow(KeyringControllerError.UnsafeDirectKeyringAccess);
        });
      });

      describe('when the keyring is not found', () => {
        it('should throw an error if the keyring is not found and `createIfMissing` is false', async () => {
          await withController(
            async ({ controller, initialState: _initialState }) => {
              const selector = { id: 'non-existent-id' };
              const fn = jest.fn();

              await expect(
                controller.withKeyring(selector, fn),
              ).rejects.toThrow(KeyringControllerError.KeyringNotFound);
              expect(fn).not.toHaveBeenCalled();
            },
          );
        });

        it('should throw an error even if `createIfMissing` is true', async () => {
          await withController(
            async ({ controller, initialState: _initialState }) => {
              const selector = { id: 'non-existent-id' };
              const fn = jest.fn();

              await expect(
                controller.withKeyring(selector, fn, { createIfMissing: true }),
              ).rejects.toThrow(KeyringControllerError.KeyringNotFound);
              expect(fn).not.toHaveBeenCalled();
            },
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
    let signProcessKeyringControllerMessenger: KeyringControllerMessenger;

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
      const { controller, messenger } = await withController(
        {
          // @ts-expect-error QRKeyring is not yet compatible with Keyring type.
          keyringBuilders: [keyringBuilderFactory(QRKeyring)],
          cacheEncryptionKey: true,
        },
        (args) => args,
      );

      signProcessKeyringController = controller;
      signProcessKeyringControllerMessenger = messenger;

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

    describe('getQRKeyring', () => {
      it('should return QR keyring', async () => {
        const qrKeyring = signProcessKeyringController.getQRKeyring();
        expect(qrKeyring).toBeDefined();
        expect(qrKeyring).toBeInstanceOf(QRKeyring);
      });

      it('should return undefined if QR keyring is not present', async () => {
        await withController(async ({ controller }) => {
          const qrKeyring = controller.getQRKeyring();
          expect(qrKeyring).toBeUndefined();
        });
      });

      it('should throw error when the controller is locked', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();

          expect(() => controller.getQRKeyring()).toThrow(
            KeyringControllerError.ControllerLocked,
          );
        });
      });
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

        const firstPage =
          await signProcessKeyringController.connectQRHardware(0);
        expect(firstPage).toHaveLength(5);
        expect(firstPage[0].index).toBe(0);

        const secondPage =
          await signProcessKeyringController.connectQRHardware(1);
        expect(secondPage).toHaveLength(5);
        expect(secondPage[0].index).toBe(5);

        const goBackPage =
          await signProcessKeyringController.connectQRHardware(-1);
        expect(goBackPage).toStrictEqual(firstPage);

        await signProcessKeyringController.unlockQRHardwareWalletAccount(0);
        await signProcessKeyringController.unlockQRHardwareWalletAccount(1);
        await signProcessKeyringController.unlockQRHardwareWalletAccount(2);

        const qrKeyring = signProcessKeyringController.state.keyrings.find(
          (keyring) => keyring.type === KeyringTypes.qr,
        );
        expect(qrKeyring?.accounts).toHaveLength(3);
      });

      it('should throw error when the controller is locked', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();

          await expect(controller.connectQRHardware(0)).rejects.toThrow(
            KeyringControllerError.ControllerLocked,
          );
        });
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

        const data = bytesToHex(
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
            common: Common.custom({
              name: 'goerli',
              chainId: parseInt('5'),
              networkId: parseInt('5'),
              defaultHardfork: 'london',
            }),
          },
        );
        const signedTx = await signProcessKeyringController.signTransaction(
          tx,
          account,
        );
        expect(signedTx.v).toBeDefined();
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

      it('should throw error when the controller is locked', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();

          await expect(controller.resetQRKeyringState()).rejects.toThrow(
            KeyringControllerError.ControllerLocked,
          );
        });
      });
    });

    describe('forgetQRDevice', () => {
      it('should forget qr keyring', async () => {
        await setupQRKeyring();
        expect(
          signProcessKeyringController.state.keyrings[1].accounts,
        ).toHaveLength(3);
        const accountsToBeRemoved =
          signProcessKeyringController.state.keyrings[1].accounts;
        const { removedAccounts, remainingAccounts } =
          await signProcessKeyringController.forgetQRDevice();
        expect(
          signProcessKeyringController.state.keyrings[1].accounts,
        ).toHaveLength(0);
        expect(accountsToBeRemoved).toStrictEqual(removedAccounts);
        expect(await signProcessKeyringController.getAccounts()).toStrictEqual(
          remainingAccounts,
        );
      });

      it('should return no removed and no remaining accounts if no QR keyring is not present', async () => {
        await withController(async ({ controller }) => {
          const { removedAccounts, remainingAccounts } =
            await controller.forgetQRDevice();

          expect(removedAccounts).toHaveLength(0);
          expect(remainingAccounts).toHaveLength(0);
        });
      });

      it('should throw error when the controller is locked', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();

          await expect(controller.forgetQRDevice()).rejects.toThrow(
            KeyringControllerError.ControllerLocked,
          );
        });
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

      it('should throw error when the controller is locked', async () => {
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
        await withController(async ({ controller }) => {
          await controller.setLocked();

          await expect(
            controller.restoreQRKeyring(serializedQRKeyring),
          ).rejects.toThrow(KeyringControllerError.ControllerLocked);
        });
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

      it('should throw error when the controller is locked', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();

          await expect(controller.getAccountKeyringType('0x0')).rejects.toThrow(
            KeyringControllerError.ControllerLocked,
          );
        });
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

      it('should throw error when the controller is locked', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();

          await expect(controller.submitQRCryptoHDKey('0x0')).rejects.toThrow(
            KeyringControllerError.ControllerLocked,
          );
        });
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

      it('should throw error when the controller is locked', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();

          await expect(controller.submitQRCryptoAccount('0x0')).rejects.toThrow(
            KeyringControllerError.ControllerLocked,
          );
        });
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

    describe('QRKeyring store events', () => {
      describe('KeyringController:qrKeyringStateChange', () => {
        it('should emit KeyringController:qrKeyringStateChange event after `getOrAddQRKeyring()`', async () => {
          const listener = jest.fn();
          signProcessKeyringControllerMessenger.subscribe(
            'KeyringController:qrKeyringStateChange',
            listener,
          );
          const qrKeyring =
            await signProcessKeyringController.getOrAddQRKeyring();

          qrKeyring.getMemStore().updateState({
            sync: {
              reading: true,
            },
          });

          expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should emit KeyringController:qrKeyringStateChange after `submitPassword()`', async () => {
          const listener = jest.fn();
          signProcessKeyringControllerMessenger.subscribe(
            'KeyringController:qrKeyringStateChange',
            listener,
          );
          // We ensure there is a QRKeyring before locking
          await signProcessKeyringController.getOrAddQRKeyring();
          // Locking the keyring will dereference the QRKeyring
          await signProcessKeyringController.setLocked();
          // ..and unlocking it should add a new instance of QRKeyring
          await signProcessKeyringController.submitPassword(password);
          // We call `getQRKeyring` instead of `getOrAddQRKeyring` so that
          // we are able to test if the subscription to the internal QR keyring
          // was made while unlocking the keyring.
          const qrKeyring = signProcessKeyringController.getQRKeyring();

          // As we added a QR keyring before lock/unlock, this must be defined
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          qrKeyring!.getMemStore().updateState({
            sync: {
              reading: true,
            },
          });

          // Only one call ensures that the first subscription made by
          // QR keyring before locking was removed
          expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should emit KeyringController:qrKeyringStateChange after `submitEncryptionKey()`', async () => {
          const listener = jest.fn();
          signProcessKeyringControllerMessenger.subscribe(
            'KeyringController:qrKeyringStateChange',
            listener,
          );
          const salt = signProcessKeyringController.state
            .encryptionSalt as string;
          // We ensure there is a QRKeyring before locking
          await signProcessKeyringController.getOrAddQRKeyring();
          // Locking the keyring will dereference the QRKeyring
          await signProcessKeyringController.setLocked();
          // ..and unlocking it should add a new instance of QRKeyring
          await signProcessKeyringController.submitEncryptionKey(
            MOCK_ENCRYPTION_KEY,
            salt,
          );
          // We call `getQRKeyring` instead of `getOrAddQRKeyring` so that
          // we are able to test if the subscription to the internal QR keyring
          // was made while unlocking the keyring.
          const qrKeyring = signProcessKeyringController.getQRKeyring();

          // As we added a QR keyring before lock/unlock, this must be defined
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          qrKeyring!.getMemStore().updateState({
            sync: {
              reading: true,
            },
          });

          // Only one call ensures that the first subscription made by
          // QR keyring before locking was removed
          expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should emit KeyringController:qrKeyringStateChange after `addNewKeyring()`', async () => {
          const listener = jest.fn();
          signProcessKeyringControllerMessenger.subscribe(
            'KeyringController:qrKeyringStateChange',
            listener,
          );
          const { id } = await signProcessKeyringController.addNewKeyring(
            KeyringTypes.qr,
          );

          await signProcessKeyringController.withKeyring(
            { id },
            // @ts-expect-error QRKeyring is not yet compatible with Keyring type.
            async ({ keyring }: { keyring: QRKeyring }) => {
              keyring.getMemStore().updateState({
                sync: {
                  reading: true,
                },
              });
            },
          );

          expect(listener).toHaveBeenCalledTimes(1);
        });
      });
    });
  });

  describe('isCustodyKeyring', () => {
    it('should return true if keyring is custody keyring', () => {
      expect(isCustodyKeyring('Custody JSON-RPC')).toBe(true);
    });

    it('should not return true if keyring is not custody keyring', () => {
      expect(isCustodyKeyring(KeyringTypes.hd)).toBe(false);
    });

    it("should not return true if the keyring doesn't start with custody", () => {
      expect(isCustodyKeyring('NotCustody')).toBe(false);
    });
  });

  describe('actions', () => {
    beforeEach(() => {
      jest
        .spyOn(KeyringController.prototype, 'signMessage')
        .mockResolvedValue('0x1234');
      jest
        .spyOn(KeyringController.prototype, 'signPersonalMessage')
        .mockResolvedValue('0x1234');
      jest
        .spyOn(KeyringController.prototype, 'signTypedMessage')
        .mockResolvedValue('0x1234');
      jest
        .spyOn(KeyringController.prototype, 'decryptMessage')
        .mockResolvedValue('I am Satoshi Buterin');
      jest
        .spyOn(KeyringController.prototype, 'getEncryptionPublicKey')
        .mockResolvedValue('ZfKqt4HSy4tt9/WvqP3QrnzbIS04cnV//BhksKbLgVA=');
      jest
        .spyOn(KeyringController.prototype, 'prepareUserOperation')
        .mockResolvedValue({
          callData: '0x706',
          initCode: '0x22ff',
          nonce: '0x1',
          gasLimits: {
            callGasLimit: '0x58a83',
            verificationGasLimit: '0xe8c4',
            preVerificationGas: '0xc57c',
          },
          dummySignature: '0x',
          dummyPaymasterAndData: '0x',
          bundlerUrl: 'https://bundler.example.com/rpc',
        });
      jest
        .spyOn(KeyringController.prototype, 'patchUserOperation')
        .mockResolvedValue({
          paymasterAndData: '0x1234',
        });
      jest
        .spyOn(KeyringController.prototype, 'signUserOperation')
        .mockResolvedValue('0x1234');
    });

    describe('signMessage', () => {
      it('should sign message', async () => {
        await withController(
          async ({ controller, messenger, initialState }) => {
            const messageParams = {
              from: initialState.keyrings[0].accounts[0],
              data: '0x1234',
            };

            await messenger.call(
              'KeyringController:signMessage',
              messageParams,
            );

            expect(controller.signMessage).toHaveBeenCalledWith(messageParams);
          },
        );
      });
    });

    describe('signPersonalMessage', () => {
      it('should sign personal message', async () => {
        await withController(
          async ({ controller, messenger, initialState }) => {
            const messageParams = {
              from: initialState.keyrings[0].accounts[0],
              data: '0x1234',
            };

            await messenger.call(
              'KeyringController:signPersonalMessage',
              messageParams,
            );

            expect(controller.signPersonalMessage).toHaveBeenCalledWith(
              messageParams,
            );
          },
        );
      });
    });

    describe('signTypedMessage', () => {
      it('should call signTypedMessage', async () => {
        await withController(
          async ({ controller, messenger, initialState }) => {
            const messageParams = {
              data: JSON.stringify({ foo: 'bar' }),
              from: initialState.keyrings[0].accounts[0],
            };

            await messenger.call(
              'KeyringController:signTypedMessage',
              messageParams,
              SignTypedDataVersion.V4,
            );

            expect(controller.signTypedMessage).toHaveBeenCalledWith(
              messageParams,
              SignTypedDataVersion.V4,
            );
          },
        );
      });
    });

    describe('getEncryptionPublicKey', () => {
      it('should call getEncryptionPublicKey', async () => {
        await withController(
          async ({ controller, messenger, initialState }) => {
            await messenger.call(
              'KeyringController:getEncryptionPublicKey',
              initialState.keyrings[0].accounts[0],
            );

            expect(controller.getEncryptionPublicKey).toHaveBeenCalledWith(
              initialState.keyrings[0].accounts[0],
            );
          },
        );
      });
    });

    describe('decryptMessage', () => {
      it('should return correct decrypted message', async () => {
        await withController(
          async ({ controller, messenger, initialState }) => {
            const messageParams = {
              from: initialState.keyrings[0].accounts[0],
              data: {
                version: '1.0',
                nonce: '123456',
                ephemPublicKey: '0xabcdef1234567890',
                ciphertext: '0xabcdef1234567890',
              },
            };

            await messenger.call(
              'KeyringController:decryptMessage',
              messageParams,
            );

            expect(controller.decryptMessage).toHaveBeenCalledWith(
              messageParams,
            );
          },
        );
      });
    });

    describe('prepareUserOperation', () => {
      const chainId = '0x1';
      const executionContext = {
        chainId,
      };

      it('should return a base UserOp', async () => {
        await withController(
          async ({ controller, messenger, initialState }) => {
            const baseTxs = [
              {
                to: '0x0c54fccd2e384b4bb6f2e405bf5cbc15a017aafb',
                value: '0x0',
                data: '0x0',
              },
            ];

            await messenger.call(
              'KeyringController:prepareUserOperation',
              initialState.keyrings[0].accounts[0],
              baseTxs,
              executionContext,
            );

            expect(controller.prepareUserOperation).toHaveBeenCalledWith(
              initialState.keyrings[0].accounts[0],
              baseTxs,
              executionContext,
            );
          },
        );
      });
    });

    describe('patchUserOperation', () => {
      const chainId = '0x1';
      const executionContext = {
        chainId,
      };
      it('should return an UserOp patch', async () => {
        await withController(
          async ({ controller, messenger, initialState }) => {
            const userOp = {
              sender: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4',
              nonce: '0x1',
              initCode: '0x',
              callData: '0x7064',
              callGasLimit: '0x58a83',
              verificationGasLimit: '0xe8c4',
              preVerificationGas: '0xc57c',
              maxFeePerGas: '0x87f0878c0',
              maxPriorityFeePerGas: '0x1dcd6500',
              paymasterAndData: '0x',
              signature: '0x',
            };

            await messenger.call(
              'KeyringController:patchUserOperation',
              initialState.keyrings[0].accounts[0],
              userOp,
              executionContext,
            );

            expect(controller.patchUserOperation).toHaveBeenCalledWith(
              initialState.keyrings[0].accounts[0],
              userOp,
              executionContext,
            );
          },
        );
      });
    });

    describe('signUserOperation', () => {
      const chainId = '0x1';
      const executionContext = {
        chainId,
      };
      it('should return an UserOp signature', async () => {
        await withController(
          async ({ controller, messenger, initialState }) => {
            const userOp = {
              sender: '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4',
              nonce: '0x1',
              initCode: '0x',
              callData: '0x7064',
              callGasLimit: '0x58a83',
              verificationGasLimit: '0xe8c4',
              preVerificationGas: '0xc57c',
              maxFeePerGas: '0x87f0878c0',
              maxPriorityFeePerGas: '0x1dcd6500',
              paymasterAndData: '0x',
              signature: '0x',
            };

            await messenger.call(
              'KeyringController:signUserOperation',
              initialState.keyrings[0].accounts[0],
              userOp,
              executionContext,
            );

            expect(controller.signUserOperation).toHaveBeenCalledWith(
              initialState.keyrings[0].accounts[0],
              userOp,
              executionContext,
            );
          },
        );
      });
    });

    describe('getKeyringsByType', () => {
      it('should return correct keyring by type', async () => {
        jest
          .spyOn(KeyringController.prototype, 'getKeyringsByType')
          .mockReturnValue([
            {
              type: 'HD Key Tree',
              accounts: ['0x1234'],
            },
          ]);
        await withController(async ({ controller, messenger }) => {
          messenger.call('KeyringController:getKeyringsByType', 'HD Key Tree');

          expect(controller.getKeyringsByType).toHaveBeenCalledWith(
            'HD Key Tree',
          );
        });
      });
    });

    describe('getKeyringForAccount', () => {
      it('should return the keyring for the account', async () => {
        jest
          .spyOn(KeyringController.prototype, 'getKeyringForAccount')
          .mockResolvedValue({
            type: 'HD Key Tree',
            accounts: ['0x1234'],
          });
        await withController(async ({ controller, messenger }) => {
          await messenger.call('KeyringController:getKeyringForAccount', '0x0');

          expect(controller.getKeyringForAccount).toHaveBeenCalledWith('0x0');
        });
      });
    });

    describe('getAccounts', () => {
      it('should return all accounts', async () => {
        jest
          .spyOn(KeyringController.prototype, 'getAccounts')
          .mockResolvedValue(['0x1234']);
        await withController(async ({ controller, messenger }) => {
          await messenger.call('KeyringController:getAccounts');

          expect(controller.getAccounts).toHaveBeenCalledWith();
        });
      });
    });

    describe('persistAllKeyrings', () => {
      it('should call persistAllKeyrings', async () => {
        jest
          .spyOn(KeyringController.prototype, 'persistAllKeyrings')
          .mockResolvedValue(true);
        await withController(async ({ controller, messenger }) => {
          await messenger.call('KeyringController:persistAllKeyrings');

          expect(controller.persistAllKeyrings).toHaveBeenCalledWith();
        });
      });
    });

    describe('withKeyring', () => {
      it('should call withKeyring', async () => {
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller, messenger }) => {
            await controller.addNewKeyring(MockKeyring.type);

            const actionReturnValue = await messenger.call(
              'KeyringController:withKeyring',
              { type: MockKeyring.type },
              async ({ keyring }) => {
                expect(keyring.type).toBe(MockKeyring.type);
                return keyring.type;
              },
            );

            expect(actionReturnValue).toBe(MockKeyring.type);
          },
        );
      });
    });
  });

  describe('run conditions', () => {
    it('should not cause run conditions when called multiple times', async () => {
      await withController(async ({ controller, initialState }) => {
        await Promise.all([
          controller.submitPassword(password),
          controller.submitPassword(password),
          controller.submitPassword(password),
          controller.submitPassword(password),
        ]);

        expect(controller.state).toStrictEqual(initialState);
      });
    });

    it('should not cause run conditions when called multiple times in combination with persistAllKeyrings', async () => {
      await withController(async ({ controller, initialState }) => {
        await Promise.all([
          controller.submitPassword(password),
          controller.persistAllKeyrings(),
          controller.submitPassword(password),
          controller.persistAllKeyrings(),
        ]);

        expect(controller.state).toStrictEqual(initialState);
      });
    });

    it('should not cause a deadlock when subscribing to state changes', async () => {
      await withController(async ({ controller, initialState, messenger }) => {
        let executed = false;
        const listener = jest.fn(async () => {
          if (!executed) {
            executed = true;
            await controller.persistAllKeyrings();
          }
        });

        messenger.subscribe('KeyringController:stateChange', listener);

        await controller.submitPassword(password);

        expect(controller.state).toStrictEqual(initialState);
        expect(listener).toHaveBeenCalled();
      });
    });
  });

  describe('atomic operations', () => {
    describe('addNewKeyring', () => {
      it('should rollback the controller keyrings if the keyring creation fails', async () => {
        const mockAddress = '0x4584d2B4905087A100420AFfCe1b2d73fC69B8E4';
        stubKeyringClassWithAccount(MockKeyring, mockAddress);
        // Mocking the serialize method to throw an error will
        // halt the controller everytime it tries to persist the keyring,
        // making it impossible to update the vault
        jest
          .spyOn(MockKeyring.prototype, 'serialize')
          .mockImplementation(async () => {
            throw new Error('You will never be able to persist me!');
          });
        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller, initialState }) => {
            await expect(
              controller.addNewKeyring(MockKeyring.type),
            ).rejects.toThrow('You will never be able to persist me!');

            expect(controller.state).toStrictEqual(initialState);
            await expect(
              controller.exportAccount(password, mockAddress),
            ).rejects.toThrow(
              'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
            );
          },
        );
      });
    });
  });
});

type WithControllerCallback<ReturnValue> = ({
  controller,
  initialState,
  encryptor,
  messenger,
}: {
  controller: KeyringController;
  encryptor: MockEncryptor;
  initialState: KeyringControllerState;
  messenger: KeyringControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = Partial<KeyringControllerOptions> & {
  skipVaultCreation?: boolean;
};

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Stub the `getAccounts` and `addAccounts` methods of the given keyring class to return the given
 * account.
 *
 * @param keyringClass - The keyring class to stub.
 * @param account - The account to return.
 */
function stubKeyringClassWithAccount(
  keyringClass: KeyringClass,
  account: string,
) {
  jest
    .spyOn(keyringClass.prototype, 'getAccounts')
    .mockResolvedValue([account]);
  jest
    .spyOn(keyringClass.prototype, 'addAccounts')
    .mockResolvedValue([account]);
}

/**
 * Build a messenger that includes all events used by the keyring
 * controller.
 *
 * @returns The messenger.
 */
function buildMessenger() {
  return new Messenger<KeyringControllerActions, KeyringControllerEvents>();
}

/**
 * Build a restricted messenger for the keyring controller.
 *
 * @param messenger - A messenger.
 * @returns The keyring controller restricted messenger.
 */
function buildKeyringControllerMessenger(messenger = buildMessenger()) {
  return messenger.getRestricted({
    name: 'KeyringController',
    allowedActions: [],
    allowedEvents: [],
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
  const messenger = buildKeyringControllerMessenger();
  const controller = new KeyringController({
    encryptor,
    messenger,
    ...rest,
  });
  if (!rest.skipVaultCreation) {
    await controller.createNewVaultAndKeychain(password);
  }
  return await fn({
    controller,
    encryptor,
    initialState: controller.state,
    messenger,
  });
}

/**
 * Construct a keyring builder with a spy.
 *
 * @param KeyringConstructor - The constructor to use for building the keyring.
 * @returns A keyring builder that uses `jest.fn()` to spy on invocations.
 */
function buildKeyringBuilderWithSpy(KeyringConstructor: KeyringClass): {
  (): EthKeyring;
  type: string;
} {
  const keyringBuilderWithSpy: { (): EthKeyring; type?: string } = jest
    .fn()
    .mockImplementation((...args) => new KeyringConstructor(...args));
  keyringBuilderWithSpy.type = KeyringConstructor.type;
  // Not sure why TypeScript isn't smart enough to infer that `type` is set here.
  return keyringBuilderWithSpy as { (): EthKeyring; type: string };
}
