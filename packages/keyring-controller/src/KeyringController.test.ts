import { Chain, Common, Hardfork } from '@ethereumjs/common';
import type { TypedTxData } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { deriveStateFromMetadata } from '@metamask/base-controller';
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
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';
import { bytesToHex, isValidHexAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { KeyringControllerErrorMessage } from './constants';
import { KeyringControllerError } from './errors';
import type {
  KeyringControllerEvents,
  KeyringControllerMessenger,
  KeyringControllerState,
  KeyringControllerOptions,
  KeyringControllerActions,
  KeyringMetadata,
  SerializedKeyring,
} from './KeyringController';
import {
  AccountImportStrategy,
  KeyringController,
  KeyringTypes,
  isCustodyKeyring,
  keyringBuilderFactory,
} from './KeyringController';
import MockEncryptor, {
  DECRYPTION_ERROR,
  MOCK_ENCRYPTION_KEY,
  SALT,
} from '../tests/mocks/mockEncryptor';
import { MockErc4337Keyring } from '../tests/mocks/mockErc4337Keyring';
import {
  HardwareWalletError,
  MockHardwareKeyring,
} from '../tests/mocks/mockHardwareKeyring';
import { MockKeyring } from '../tests/mocks/mockKeyring';
import MockShallowKeyring from '../tests/mocks/mockShallowKeyring';
import { buildMockTransaction } from '../tests/mocks/mockTransaction';

type AllKeyringControllerActions = MessengerActions<KeyringControllerMessenger>;

type AllKeyringControllerEvents = MessengerEvents<KeyringControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllKeyringControllerActions,
  AllKeyringControllerEvents
>;

jest.mock('uuid', () => {
  return {
    ...jest.requireActual('uuid'),
    v4: (): string => '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
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

const defaultKeyrings: SerializedKeyring[] = [
  {
    type: 'HD Key Tree',
    data: {
      mnemonic: [
        119, 97, 114, 114, 105, 111, 114, 32, 108, 97, 110, 103, 117, 97, 103,
        101, 32, 106, 111, 107, 101, 32, 98, 111, 110, 117, 115, 32, 117, 110,
        102, 97, 105, 114, 32, 97, 114, 116, 105, 115, 116, 32, 107, 97, 110,
        103, 97, 114, 111, 111, 32, 99, 105, 114, 99, 108, 101, 32, 101, 120,
        112, 97, 110, 100, 32, 104, 111, 112, 101, 32, 109, 105, 100, 100, 108,
        101, 32, 103, 97, 117, 103, 101,
      ],
      numberOfAccounts: 1,
      hdPath: "m/44'/60'/0'/0",
    },
    metadata: { id: '01JXEFM7DAX2VJ0YFR4ESNY3GQ', name: '' },
  },
];

const defaultCredentials = { password, salt: 'salt' };

/**
 * Build a vault string with the given keyrings.
 * This vault can be used with the MockEncryptor to test KeyringController
 * with controlled keyrings.
 *
 * @param keyrings - The keyrings to include in the vault.
 * @returns The vault string.
 */
function createVault(keyrings: SerializedKeyring[] = defaultKeyrings): string {
  return JSON.stringify({
    data: JSON.stringify({
      tag: { key: defaultCredentials, iv: 'iv' },
      value: keyrings,
    }),
    iv: 'iv',
    salt: 'salt',
  });
}

describe('KeyringController', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
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
            vault: createVault([
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
            ]),
          },
        },
        async ({ controller }) => {
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
            vault: createVault([
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
            ]),
          },
        },
        async ({ controller }) => {
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
          {
            skipVaultCreation: true,
            state: { vault: createVault([{ type: 'Unsupported', data: '' }]) },
          },
          async ({ controller }) => {
            await controller.submitPassword(password);

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
          KeyringControllerErrorMessage.ControllerLocked,
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
            getAccounts: async (): Promise<[undefined, undefined]> => [
              undefined,
              undefined,
            ],
          },
        ]);

        await expect(controller.addNewAccount(1)).rejects.toThrow(
          "Can't find account at index 1",
        );
      });
    });

    it('should throw error if the account is duplicated', async () => {
      const mockAddress: Hex = '0x123';
      const addAccountsSpy = jest.spyOn(HdKeyring.prototype, 'addAccounts');
      const getAccountsSpy = jest.spyOn(HdKeyring.prototype, 'getAccounts');
      const serializeSpy = jest.spyOn(HdKeyring.prototype, 'serialize');

      addAccountsSpy.mockResolvedValue([mockAddress]);
      getAccountsSpy.mockResolvedValue([mockAddress]);
      await withController(async ({ controller }) => {
        getAccountsSpy.mockResolvedValue([mockAddress, mockAddress]);
        serializeSpy
          .mockResolvedValueOnce({
            mnemonic: [],
            numberOfAccounts: 1,
            hdPath: "m/44'/60'/0'/0",
          })
          .mockResolvedValueOnce({
            mnemonic: [],
            numberOfAccounts: 2,
            hdPath: "m/44'/60'/0'/0",
          });
        await expect(controller.addNewAccount()).rejects.toThrow(
          KeyringControllerErrorMessage.DuplicatedAccount,
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
            keyringBuilders: [keyringBuilderFactory(MockShallowKeyring)],
          },
          async ({ controller }) => {
            await controller.addNewKeyring(MockShallowKeyring.type);
            // TODO: This is a temporary workaround while `addNewAccountForKeyring` is not
            // removed.
            const mockKeyring = controller.getKeyringsByType(
              MockShallowKeyring.type,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
          KeyringControllerErrorMessage.ControllerLocked,
        );
      });
    });
  });

  describe('createNewVaultAndRestore', () => {
    it('should create new vault and restore', async () => {
      await withController(async ({ controller, initialState }) => {
        const initialKeyrings = controller.state.keyrings;
        await controller.createNewVaultAndRestore(password, uint8ArraySeed);
        expect(controller.state).not.toBe(initialState);
        expect(controller.state.vault).toBeDefined();
        expect(controller.state.keyrings).toHaveLength(initialKeyrings.length);
        // new keyring metadata should be generated
        expect(controller.state.keyrings).not.toStrictEqual(initialKeyrings);
      });
    });

    it('should call encryptor.encrypt with the same keyrings if old seedWord is used', async () => {
      await withController(async ({ controller, encryptor }) => {
        const encryptSpy = jest.spyOn(encryptor, 'encryptWithKey');
        const serializedKeyring = await controller.withKeyring(
          { type: 'HD Key Tree' },
          async ({ keyring }) => keyring.serialize(),
        );
        const currentSeedWord = await controller.exportSeedPhrase(password);

        await controller.createNewVaultAndRestore(password, currentSeedWord);

        const key = JSON.parse(MOCK_ENCRYPTION_KEY);
        expect(encryptSpy).toHaveBeenCalledWith(key, [
          {
            data: serializedKeyring,
            type: 'HD Key Tree',
            metadata: {
              id: expect.any(String),
              name: '',
            },
          },
        ]);
      });
    });

    it('should create new vault with a different password', async () => {
      await withController(async ({ controller, initialState }) => {
        const initialKeyrings = controller.state.keyrings;

        await controller.createNewVaultAndRestore(
          'new-password',
          uint8ArraySeed,
        );

        expect(controller.state).not.toBe(initialState);
        expect(controller.state.vault).toBeDefined();
        expect(controller.state.keyrings).toHaveLength(initialKeyrings.length);
        // new keyring metadata should be generated
        expect(controller.state.keyrings).not.toStrictEqual(initialKeyrings);
      });
    });

    it('should throw error if creating new vault and restore without password', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.createNewVaultAndRestore('', uint8ArraySeed),
        ).rejects.toThrow(KeyringControllerErrorMessage.InvalidEmptyPassword);
      });
    });

    it('should throw error if creating new vault and restoring without seed phrase', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.createNewVaultAndRestore(
            password,
            // @ts-expect-error invalid seed phrase
            '',
          ),
        ).rejects.toThrow(
          'Eth-Hd-Keyring: Deserialize method cannot be called with an opts value for numberOfAccounts and no menmonic',
        );
      });
    });

    it('should set encryptionKey and encryptionSalt in state', async () => {
      await withController(async ({ controller }) => {
        await controller.createNewVaultAndRestore(password, uint8ArraySeed);
        expect(controller.state.encryptionKey).toBeDefined();
        expect(controller.state.encryptionSalt).toBeDefined();
      });
    });
  });

  describe('createNewVaultAndKeychain', () => {
    describe('when there is no existing vault', () => {
      it('should create new vault, mnemonic and keychain', async () => {
        await withController(
          { skipVaultCreation: true },
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

      it('should set encryptionKey and encryptionSalt in state', async () => {
        await withController(
          { skipVaultCreation: true },
          async ({ controller }) => {
            await controller.createNewVaultAndKeychain(password);

            expect(controller.state.encryptionKey).toBeDefined();
            expect(controller.state.encryptionSalt).toBeDefined();
          },
        );
      });

      it('should set default state', async () => {
        await withController(
          { skipVaultCreation: true },
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
          { skipVaultCreation: true },
          async ({ controller }) => {
            await expect(
              controller.createNewVaultAndKeychain(
                // @ts-expect-error invalid password
                123,
              ),
            ).rejects.toThrow(KeyringControllerErrorMessage.WrongPasswordType);
          },
        );
      });

      it('should throw error if the first account is not found on the keyring', async () => {
        jest.spyOn(HdKeyring.prototype, 'getAccounts').mockResolvedValue([]);
        await withController(
          { skipVaultCreation: true },
          async ({ controller }) => {
            await expect(
              controller.createNewVaultAndKeychain(password),
            ).rejects.toThrow(KeyringControllerErrorMessage.NoFirstAccount);
          },
        );
      });

      it('should throw error when HD keyring does not support generateRandomMnemonic', async () => {
        // Create a custom HD keyring that doesn't support generateRandomMnemonic
        class MockHdKeyringWithoutMnemonic {
          static type = 'HD Key Tree';

          type = 'HD Key Tree';

          async getAccounts(): Promise<string[]> {
            return [];
          }

          async addAccounts(): Promise<string[]> {
            return [];
          }

          serialize = async (): Promise<{ type: string }> => ({
            type: this.type,
          });

          deserialize = async (): Promise<void> => {
            // noop
          };
        }

        const mockBuilder = keyringBuilderFactory(
          MockHdKeyringWithoutMnemonic as unknown as KeyringClass,
        );

        await withController(
          {
            skipVaultCreation: true,
            keyringBuilders: [mockBuilder],
          },
          async ({ controller }) => {
            // Try to create a new vault, which will attempt to generate a mnemonic
            await expect(
              controller.createNewVaultAndKeychain(password),
            ).rejects.toThrow(
              KeyringControllerErrorMessage.UnsupportedGenerateRandomMnemonic,
            );
          },
        );
      });
    });

    describe('when there is an existing vault', () => {
      it('should not create a new vault or keychain', async () => {
        await withController(async ({ controller, initialState }) => {
          const initialSeedWord = await controller.exportSeedPhrase(password);
          expect(initialSeedWord).toBeDefined();
          const initialVault = controller.state.vault;

          await controller.createNewVaultAndKeychain(password);

          const currentSeedWord = await controller.exportSeedPhrase(password);
          expect(initialState).toStrictEqual(controller.state);
          expect(initialSeedWord).toBe(currentSeedWord);
          expect(initialVault).toStrictEqual(controller.state.vault);
        });
      });

      it('should set encryptionKey and encryptionSalt in state', async () => {
        await withController(async ({ controller }) => {
          await controller.setLocked();
          expect(controller.state.encryptionKey).toBeUndefined();
          expect(controller.state.encryptionSalt).toBeUndefined();

          await controller.createNewVaultAndKeychain(password);

          expect(controller.state.encryptionKey).toBeDefined();
          expect(controller.state.encryptionSalt).toBeDefined();
        });
      });
    });
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
        const listener = jest.fn();
        messenger.subscribe('KeyringController:lock', listener);
        await controller.setLocked();
        expect(listener).toHaveBeenCalled();
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.setLocked()).rejects.toThrow(
          KeyringControllerErrorMessage.ControllerLocked,
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
          KeyringControllerErrorMessage.ControllerLocked,
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
            ).rejects.toThrow(
              KeyringControllerErrorMessage.UnsupportedExportAccount,
            );
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
          KeyringControllerErrorMessage.ControllerLocked,
        );
      });
    });
  });

  describe('getAccountKeyringType', () => {
    it('should return the keyring type for the given account', async () => {
      await withController(async ({ controller, initialState }) => {
        const account = initialState.keyrings[0].accounts[0];
        const keyringType = await controller.getAccountKeyringType(account);
        expect(keyringType).toBe(KeyringTypes.hd);
      });
    });

    it('should throw error if no keyring is found for the given account', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.getAccountKeyringType('0x')).rejects.toThrow(
          'KeyringController - No keyring found. Error info: There are keyrings, but none match the address',
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
              KeyringControllerErrorMessage.UnsupportedGetEncryptionPublicKey,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
            ).rejects.toThrow(
              KeyringControllerErrorMessage.UnsupportedDecryptMessage,
            );
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
          expect(await keyring.getAccounts()).toStrictEqual(
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
          {
            skipVaultCreation: true,
            state: { vault: createVault([{ type: 'Unsupported', data: '' }]) },
          },
          async ({ controller }) => {
            await controller.submitPassword(password);

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
          ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
        });
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.setLocked();

        await expect(
          controller.getKeyringForAccount(initialState.keyrings[0].accounts[0]),
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
          expect(await keyrings[0].getAccounts()).toStrictEqual(
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
          KeyringControllerErrorMessage.ControllerLocked,
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
          KeyringControllerErrorMessage.ControllerLocked,
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
            const modifiedStateWithoutVault = {
              ...modifiedState,
              vault: undefined,
            };
            const stateWithoutVault = {
              ...controller.state,
              vault: undefined,
            };
            expect(stateWithoutVault).toStrictEqual(modifiedStateWithoutVault);
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
            const modifiedStateWithoutVault = {
              ...modifiedState,
              vault: undefined,
            };
            const stateWithoutVault = {
              ...controller.state,
              vault: undefined,
            };
            expect(stateWithoutVault).toStrictEqual(modifiedStateWithoutVault);
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
            ).rejects.toThrow(KeyringControllerErrorMessage.DuplicatedAccount);
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
            KeyringControllerErrorMessage.LastAccountInPrimaryKeyring,
          );
          expect(controller.state.keyrings).toHaveLength(1);
          expect(controller.state.keyrings[0].accounts).toHaveLength(1);
        });
      });

      it('should not remove primary keyring when address is not normalized', async () => {
        await withController(async ({ controller, initialState }) => {
          const account = initialState.keyrings[0].accounts[0] as Hex;
          // Convert to checksummed/uppercase address (non-normalized), keeping 0x prefix lowercase
          const nonNormalizedAccount = `0x${account.slice(2).toUpperCase()}`;
          await expect(
            controller.removeAccount(nonNormalizedAccount),
          ).rejects.toThrow(
            KeyringControllerErrorMessage.LastAccountInPrimaryKeyring,
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
          ).rejects.toThrow(
            KeyringControllerErrorMessage.LastAccountInPrimaryKeyring,
          );
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
          const listener = jest.fn();
          messenger.subscribe('KeyringController:accountRemoved', listener);

          const removedAccount = '0x51253087e6f8358b5f10c0a94315d69db3357859';
          await controller.removeAccount(removedAccount);

          expect(listener).toHaveBeenCalledWith(removedAccount);
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
          ).rejects.toThrow('KeyringController - No keyring found');

          await expect(
            controller.removeAccount('0xDUMMY_INPUT'),
          ).rejects.toThrow('KeyringController - No keyring found');
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

      it('should not remove other empty keyrings when removing an account', async () => {
        await withController(async ({ controller }) => {
          // Import an account, creating a Simple keyring with 1 account
          const importedAccount = await controller.importAccountWithStrategy(
            AccountImportStrategy.privateKey,
            [privateKey],
          );

          // Add an empty Simple keyring (no accounts)
          await controller.addNewKeyring(KeyringTypes.simple);

          // We now have: 1 HD keyring + 1 Simple keyring (with account) + 1 empty Simple keyring = 3 keyrings
          expect(controller.state.keyrings).toHaveLength(3);
          expect(controller.state.keyrings[1].accounts).toStrictEqual([
            importedAccount,
          ]);
          expect(controller.state.keyrings[2].accounts).toStrictEqual([]);

          // Remove the imported account (empties the first Simple keyring)
          await controller.removeAccount(importedAccount);

          // Only the targeted keyring should be removed, the other empty Simple keyring should remain
          expect(controller.state.keyrings).toHaveLength(2);
          expect(controller.state.keyrings[0].type).toBe(KeyringTypes.hd);
          expect(controller.state.keyrings[1].type).toBe(KeyringTypes.simple);
          expect(controller.state.keyrings[1].accounts).toStrictEqual([]);
        });
      });

      it('should await an async removeAccount method before removing the keyring', async () => {
        const address = '0x5AC6D462f054690a373FABF8CC28e161003aEB19';

        // Track async operation state
        let removeAccountCompleted = false;
        let keyringCountDuringRemove: number | undefined;

        // Create a mock keyring class with an async removeAccount
        class AsyncRemoveAccountKeyring extends MockKeyring {
          static override type = 'Async Remove Account Keyring';

          override type = 'Async Remove Account Keyring';

          removeAccount = jest.fn(async () => {
            // Simulate async operation with a delay
            await new Promise((resolve) => setTimeout(resolve, 10));
            removeAccountCompleted = true;
          });
        }

        stubKeyringClassWithAccount(AsyncRemoveAccountKeyring, address);

        await withController(
          {
            keyringBuilders: [keyringBuilderFactory(AsyncRemoveAccountKeyring)],
          },
          async ({ controller, messenger }) => {
            await controller.addNewKeyring(AsyncRemoveAccountKeyring.type);
            expect(controller.state.keyrings).toHaveLength(2);

            // Subscribe to state changes to capture timing
            messenger.subscribe('KeyringController:stateChange', () => {
              // Record keyring count when state changes and removeAccount hasn't completed yet
              if (
                !removeAccountCompleted &&
                keyringCountDuringRemove === undefined
              ) {
                keyringCountDuringRemove = controller.state.keyrings.length;
              }
            });

            await controller.removeAccount(address);

            // Verify removeAccount completed before the keyring was removed
            expect(removeAccountCompleted).toBe(true);
            // The keyring should only be removed after removeAccount completes,
            // so the first state change should still have 2 keyrings (or be undefined if no change occurred before completion)
            // After completion, keyring count should be 1
            expect(controller.state.keyrings).toHaveLength(1);
          },
        );
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
              KeyringControllerErrorMessage.UnsupportedRemoveAccount,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
              KeyringControllerErrorMessage.UnsupportedSignMessage,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
      });
    });
  });

  describe('signPersonalMessage', () => {
    describe('when the keyring for the given address supports signPersonalMessage', () => {
      it('should sign personal message', async () => {
        await withController(async ({ controller, initialState }) => {
          const data = bytesToHex(
            new Uint8Array(Buffer.from('Hello from test', 'utf8')),
          );
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
              KeyringControllerErrorMessage.UnsupportedSignPersonalMessage,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
              KeyringControllerErrorMessage.MissingEip7702AuthorizationContractAddress,
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
              KeyringControllerErrorMessage.UnsupportedSignEip7702Authorization,
            );
          },
        );
      });
    });
  });

  describe('signTypedMessage', () => {
    describe('when the keyring for the given address supports signTypedMessage', () => {
      it('should throw when given invalid version', async () => {
        await withController(async ({ controller, initialState }) => {
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
            "Keyring Controller signTypedMessage: KeyringControllerError: Unexpected signTypedMessage version: 'junk'",
          );
        });
      });

      it('should sign typed message V1', async () => {
        await withController(async ({ controller, initialState }) => {
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
        });
      });

      it('should sign typed message V3', async () => {
        await withController(async ({ controller, initialState }) => {
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
        });
      });

      it('should sign typed message V4', async () => {
        await withController(async ({ controller, initialState }) => {
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
        });
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
              KeyringControllerErrorMessage.UnsupportedSignTypedMessage,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
              KeyringControllerErrorMessage.UnsupportedSignTransaction,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
              KeyringControllerErrorMessage.UnsupportedPrepareUserOperation,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
              KeyringControllerErrorMessage.UnsupportedPatchUserOperation,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
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
              KeyringControllerErrorMessage.UnsupportedSignUserOperation,
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
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
      });
    });
  });

  describe('changePassword', () => {
    it('should encrypt the vault with the new password', async () => {
      await withController(async ({ controller, encryptor }) => {
        const newPassword = 'new-password';
        const keyFromPasswordSpy = jest.spyOn(encryptor, 'keyFromPassword');

        await controller.changePassword(newPassword);

        expect(keyFromPasswordSpy).toHaveBeenCalledWith(
          newPassword,
          controller.state.encryptionSalt,
          true,
        );
      });
    });

    it('should throw error if `isUnlocked` is false', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(async () => controller.changePassword('')).rejects.toThrow(
          KeyringControllerErrorMessage.ControllerLocked,
        );
      });
    });

    it('should throw error if the new password is an empty string', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.changePassword('')).rejects.toThrow(
          KeyringControllerErrorMessage.InvalidEmptyPassword,
        );
      });
    });

    it('should throw error if the new password is undefined', async () => {
      await withController(async ({ controller }) => {
        await expect(
          // @ts-expect-error we are testing wrong input
          controller.changePassword(undefined),
        ).rejects.toThrow(KeyringControllerErrorMessage.WrongPasswordType);
      });
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(async () =>
          controller.changePassword('whatever'),
        ).rejects.toThrow(KeyringControllerErrorMessage.ControllerLocked);
      });
    });
  });

  describe('submitPassword', () => {
    it('should submit password and decrypt', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.submitPassword(password);
        expect(controller.state).toStrictEqual(initialState);
      });
    });

    it('should emit KeyringController:unlock event', async () => {
      await withController(async ({ controller, messenger }) => {
        const listener = jest.fn();
        messenger.subscribe('KeyringController:unlock', listener);
        await controller.submitPassword(password);
        expect(listener).toHaveBeenCalled();
      });
    });

    it('should unlock also with unsupported keyrings', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: 'UnsupportedKeyring',
                data: '0x1234',
              },
            ]),
          },
        },
        async ({ controller }) => {
          await controller.submitPassword(password);

          expect(controller.state.isUnlocked).toBe(true);
        },
      );
    });

    it('should throw error if vault unlocked has an unexpected shape', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                // @ts-expect-error testing invalid vault shape
                foo: 'bar',
              },
            ]),
          },
        },
        async ({ controller }) => {
          await expect(controller.submitPassword(password)).rejects.toThrow(
            KeyringControllerErrorMessage.VaultDataError,
          );
        },
      );
    });

    it('should throw error if vault is missing', async () => {
      await withController(
        { skipVaultCreation: true },
        async ({ controller }) => {
          await expect(controller.submitPassword(password)).rejects.toThrow(
            KeyringControllerErrorMessage.VaultError,
          );
        },
      );
    });

    it('should throw an error if the encryptor returns an undefined encryption key', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault(),
            encryptionKey: 'existing-key',
          } as KeyringControllerState,
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'decryptWithDetail').mockResolvedValueOnce({
            vault: defaultKeyrings,
            // @ts-expect-error we are testing a broken encryptor
            exportedKeyString: undefined,
            salt: '',
          });

          await expect(controller.submitPassword(password)).rejects.toThrow(
            KeyringControllerErrorMessage.MissingCredentials,
          );
        },
      );
    });

    it('should unlock succesfully when the controller is instantiated with an existing `keyringsMetadata`', async () => {
      stubKeyringClassWithAccount(HdKeyring, '0x123');
      await withController(
        {
          state: {
            vault: createVault([
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
            ]),
          },
          skipVaultCreation: true,
        },
        async ({ controller }) => {
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

    it('should generate new metadata when there is no metadata in the vault', async () => {
      const vault = createVault([
        {
          type: KeyringTypes.hd,
          data: {
            accounts: ['0x123'],
          },
        },
      ]);
      const hdKeyringSerializeSpy = jest.spyOn(
        HdKeyring.prototype,
        'serialize',
      );
      await withController(
        {
          state: {
            vault,
          },
          skipVaultCreation: true,
        },
        async ({ controller, encryptor }) => {
          const encryptWithKeySpy = jest.spyOn(encryptor, 'encryptWithKey');
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
          expect(encryptWithKeySpy).toHaveBeenCalledWith(defaultCredentials, [
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
      stubKeyringClassWithAccount(HdKeyring, '0x123');
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: KeyringTypes.hd,
                data: {},
              },
              {
                type: MockKeyring.type,
                data: {},
              },
            ]),
          },
          keyringBuilders: [keyringBuilderFactory(MockKeyring)],
        },
        async ({ controller, encryptor, messenger }) => {
          const unlockListener = jest.fn();
          messenger.subscribe('KeyringController:unlock', unlockListener);
          jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(false);

          await controller.submitPassword(password);

          expect(controller.state.isUnlocked).toBe(true);
          expect(unlockListener).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should unlock the wallet also if encryption parameters are outdated and the vault upgrade fails', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: KeyringTypes.hd,
                data: {
                  accounts: ['0x123'],
                },
              },
            ]),
          },
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(false);
          jest.spyOn(encryptor, 'encrypt').mockRejectedValue(new Error());

          await controller.submitPassword(password);

          expect(controller.state.isUnlocked).toBe(true);
        },
      );
    });

    it('should unlock the wallet discarding existing duplicate accounts', async () => {
      stubKeyringClassWithAccount(MockKeyring, '0x123');
      stubKeyringClassWithAccount(HdKeyring, '0x123');
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: KeyringTypes.hd,
                data: {},
              },
              {
                type: MockKeyring.type,
                data: {},
              },
            ]),
          },
          keyringBuilders: [keyringBuilderFactory(MockKeyring)],
        },
        async ({ controller, messenger }) => {
          const unlockListener = jest.fn();
          messenger.subscribe('KeyringController:unlock', unlockListener);

          await controller.submitPassword(password);

          expect(controller.state.keyrings).toHaveLength(1); // Second keyring will be skipped as "unsupported".
          expect(unlockListener).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should upgrade the vault encryption if the key encryptor has different parameters', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: KeyringTypes.hd,
                data: {
                  accounts: ['0x123'],
                },
              },
            ]),
          },
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(false);
          const encryptSpy = jest.spyOn(encryptor, 'encryptWithKey');

          await controller.submitPassword(password);

          expect(encryptSpy).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should not upgrade the vault encryption if the key encryptor has the same parameters', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: KeyringTypes.hd,
                data: {
                  accounts: ['0x123'],
                },
              },
            ]),
          },
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(true);
          const encryptSpy = jest.spyOn(encryptor, 'encrypt');

          // TODO actually this does trigger re-encryption. The catch is
          // that this test is run with cacheEncryptionKey enabled, so
          // `encryptWithKey` is being used instead of `encrypt`. Hence,
          // the spy on `encrypt` doesn't trigger.
          await controller.submitPassword(password);

          expect(encryptSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('should not upgrade the vault encryption if the encryptor has the same parameters and the keyring has metadata', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
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
            ]),
          },
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(true);
          const encryptSpy = jest.spyOn(encryptor, 'encrypt');

          await controller.submitPassword(password);

          expect(encryptSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('should set encryptionKey and encryptionSalt in state', async () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      withController(async ({ controller }) => {
        await controller.submitPassword(password);
        expect(controller.state.encryptionKey).toBeDefined();
        expect(controller.state.encryptionSalt).toBeDefined();
      });
    });

    it('should throw error when using the wrong password', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault(),
            // @ts-expect-error we want to force the controller to have an
            // encryption salt equal to the one in the vault
            encryptionSalt: SALT,
          },
        },
        async ({ controller }) => {
          await expect(
            controller.submitPassword('wrong password'),
          ).rejects.toThrow(DECRYPTION_ERROR);
        },
      );
    });

    it('should throw an error if the password is not a string', async () => {
      await withController(async ({ controller }) => {
        await expect(
          // @ts-expect-error we are testing wrong input
          controller.submitPassword(123456),
        ).rejects.toThrow(KeyringControllerErrorMessage.WrongPasswordType);
      });
    });

    it('should siletly fail the key derivation params upgrade if it fails', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: KeyringTypes.hd,
                data: {
                  accounts: ['0x123'],
                },
              },
            ]),
          },
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'isVaultUpdated').mockReturnValue(false);
          jest
            .spyOn(encryptor, 'exportKey')
            .mockRejectedValue(new Error('Error'));

          await controller.submitPassword(password);

          expect(controller.state.isUnlocked).toBe(true);
        },
      );
    });
  });

  describe('submitEncryptionKey', () => {
    it('should submit encryption key and decrypt', async () => {
      await withController(async ({ controller, initialState }) => {
        await controller.submitEncryptionKey(
          MOCK_ENCRYPTION_KEY,
          initialState.encryptionSalt as string,
        );
        expect(controller.state).toStrictEqual(initialState);
      });
    });

    it('should unlock also with unsupported keyrings', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: 'UnsupportedKeyring',
                data: '0x1234',
              },
            ]),
            // @ts-expect-error we want to force the controller to have an
            // encryption salt equal to the one in the vault
            encryptionSalt: SALT,
          },
        },
        async ({ controller, initialState }) => {
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
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: KeyringTypes.hd,
                data: '0x123',
              },
            ]),
            // @ts-expect-error we want to force the controller to have an
            // encryption salt equal to the one in the vault
            encryptionSalt: SALT,
          },
        },
        async ({ controller, initialState, encryptor }) => {
          const encryptWithKeySpy = jest.spyOn(encryptor, 'encryptWithKey');

          await controller.submitEncryptionKey(
            MOCK_ENCRYPTION_KEY,
            initialState.encryptionSalt as string,
          );

          expect(controller.state.isUnlocked).toBe(true);
          expect(encryptWithKeySpy).toHaveBeenCalledWith(
            JSON.parse(MOCK_ENCRYPTION_KEY),
            [
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
            ],
          );
        },
      );
    });

    it('should suppress errors if new metadata is created while unlocking and the vault update fails', async () => {
      jest.spyOn(HdKeyring.prototype, 'serialize').mockResolvedValue({
        // @ts-expect-error we are assigning a mock value
        accounts: ['0x123'],
      });
      await withController(
        {
          skipVaultCreation: true,
          state: {
            vault: createVault([
              {
                type: KeyringTypes.hd,
                data: '0x123',
              },
            ]),
            // @ts-expect-error we want to force the controller to have an
            // encryption salt equal to the one in the vault
            encryptionSalt: SALT,
          },
        },
        async ({ controller, initialState, encryptor }) => {
          const encryptWithKeySpy = jest.spyOn(encryptor, 'encryptWithKey');
          jest
            .spyOn(encryptor, 'encryptWithKey')
            .mockRejectedValueOnce(new Error('Error'));

          await controller.submitEncryptionKey(
            MOCK_ENCRYPTION_KEY,
            initialState.encryptionSalt as string,
          );

          expect(controller.state.isUnlocked).toBe(true);
          expect(encryptWithKeySpy).toHaveBeenCalledWith(
            JSON.parse(MOCK_ENCRYPTION_KEY),
            [
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
            ],
          );
        },
      );
    });

    it('should throw error if vault unlocked has an unexpected shape', async () => {
      await withController(async ({ controller, initialState, encryptor }) => {
        jest.spyOn(encryptor, 'decryptWithKey').mockResolvedValueOnce([
          {
            foo: 'bar',
          },
        ]);

        await expect(
          controller.submitEncryptionKey(
            MOCK_ENCRYPTION_KEY,
            initialState.encryptionSalt as string,
          ),
        ).rejects.toThrow(KeyringControllerErrorMessage.VaultDataError);
      });
    });

    it('should throw error if encryptionSalt is different from the one in the vault', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.submitEncryptionKey(MOCK_ENCRYPTION_KEY, '0x1234'),
        ).rejects.toThrow(KeyringControllerErrorMessage.ExpiredCredentials);
      });
    });

    it('should throw error if encryptionKey is of an unexpected type', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.submitEncryptionKey(
            // @ts-expect-error we are testing the case of a user using
            // the wrong encryptionKey type
            12341234,
            SALT,
          ),
        ).rejects.toThrow(KeyringControllerErrorMessage.WrongEncryptionKeyType);
      });
    });
  });

  describe('exportEncryptionKey', () => {
    it('should export encryption key and unlock', async () => {
      await withController(async ({ controller }) => {
        const encryptionKey = await controller.exportEncryptionKey();
        expect(encryptionKey).toBeDefined();

        await controller.setLocked();

        await controller.submitEncryptionKey(encryptionKey);

        expect(controller.isUnlocked()).toBe(true);
      });
    });

    it('should throw error if controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();
        await expect(controller.exportEncryptionKey()).rejects.toThrow(
          KeyringControllerErrorMessage.ControllerLocked,
        );
      });
    });

    it('should export key after password change', async () => {
      await withController(async ({ controller }) => {
        await controller.changePassword('new password');
        const encryptionKey = await controller.exportEncryptionKey();
        expect(encryptionKey).toBeDefined();
      });
    });

    it('should export key after password change to the same password', async () => {
      await withController(async ({ controller }) => {
        await controller.changePassword(password);
        const encryptionKey = await controller.exportEncryptionKey();
        expect(encryptionKey).toBeDefined();
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
            KeyringControllerErrorMessage.ControllerLocked,
          );
        },
      );
    });

    it('should throw unsupported seed phrase error when keyring is not HD', async () => {
      await withController(async ({ controller }) => {
        await controller.addNewKeyring(KeyringTypes.simple, [privateKey]);

        const keyringId = controller.state.keyrings[1].metadata.id;
        await expect(controller.verifySeedPhrase(keyringId)).rejects.toThrow(
          KeyringControllerErrorMessage.UnsupportedVerifySeedPhrase,
        );
      });
    });

    it('should throw an error if there is no primary keyring', async () => {
      await withController(
        {
          skipVaultCreation: true,
          state: { vault: createVault([{ type: 'Unsupported', data: '' }]) },
        },
        async ({ controller }) => {
          await controller.submitPassword(password);

          await expect(controller.verifySeedPhrase()).rejects.toThrow(
            KeyringControllerErrorMessage.KeyringNotFound,
          );
        },
      );
    });

    it('should throw error when the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await controller.setLocked();

        await expect(controller.verifySeedPhrase()).rejects.toThrow(
          KeyringControllerErrorMessage.ControllerLocked,
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
              KeyringControllerErrorMessage.VaultError,
            );
          },
        );
      });
    });

    describe('when wrong password is provided', () => {
      it('should throw an error', async () => {
        await withController(async ({ controller, encryptor }) => {
          jest
            .spyOn(encryptor, 'decrypt')
            .mockRejectedValue(new Error('Incorrect password'));

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
              KeyringControllerErrorMessage.VaultError,
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
        const fn = async ({
          keyring,
        }: {
          keyring: EthKeyring;
        }): Promise<never> => {
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
          const fn = async (): Promise<string> => Promise.resolve('hello');
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
          ).rejects.toThrow(
            KeyringControllerErrorMessage.UnsafeDirectKeyringAccess,
          );
        });
      });

      describe('when the keyring is not found', () => {
        it('should throw an error if the keyring is not found and `createIfMissing` is false', async () => {
          await withController(async ({ controller }) => {
            const selector = { type: 'foo' };
            const fn = jest.fn();

            await expect(controller.withKeyring(selector, fn)).rejects.toThrow(
              KeyringControllerErrorMessage.KeyringNotFound,
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

        it('should update the vault if the keyring is being updated but `keyring.serialize()` includes a shallow copy', async () => {
          await withController(
            { keyringBuilders: [keyringBuilderFactory(MockShallowKeyring)] },
            async ({ controller, messenger }) => {
              await controller.addNewKeyring(MockShallowKeyring.type);
              const mockStateChange = jest.fn();
              messenger.subscribe(
                'KeyringController:stateChange',
                mockStateChange,
              );

              await controller.withKeyring(
                { type: MockShallowKeyring.type },
                async ({ keyring }) => keyring.addAccounts(1),
              );

              expect(mockStateChange).toHaveBeenCalled();
              expect(controller.state.keyrings[1].accounts).toHaveLength(1);
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
          const fn = async (): Promise<string> => Promise.resolve('hello');
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
          const fn = async (): Promise<string> => Promise.resolve('hello');
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
          ).rejects.toThrow(
            KeyringControllerErrorMessage.UnsafeDirectKeyringAccess,
          );
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
              ).rejects.toThrow(KeyringControllerErrorMessage.KeyringNotFound);
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
              ).rejects.toThrow(KeyringControllerErrorMessage.KeyringNotFound);
              expect(fn).not.toHaveBeenCalled();
            },
          );
        });
      });
    });

    it('should throw KeyringNotFound if keyring metadata is not found (internal consistency check)', async () => {
      // This test verifies the defensive #getKeyringMetadata guard that ensures
      // internal state consistency. In normal operation, this should never occur,
      // but the guard exists to catch potential data corruption scenarios where
      // a keyring exists but its metadata is not in the internal keyrings array.
      await withController(async ({ controller }) => {
        // Mock getKeyringForAccount to return a keyring that isn't in the internal array
        // This simulates an inconsistent internal state
        const mockOrphanKeyring: Partial<EthKeyring> = {
          type: 'OrphanKeyring',
          getAccounts: jest.fn().mockResolvedValue([]),
        };

        jest
          .spyOn(controller, 'getKeyringForAccount')
          .mockResolvedValue(mockOrphanKeyring as EthKeyring);

        const selector = {
          address: '0x1234567890123456789012345678901234567890' as Hex,
        };
        const fn = jest.fn();

        // This should trigger the #getKeyringMetadata error because mockOrphanKeyring
        // is not in the internal #keyrings array
        await expect(controller.withKeyring(selector, fn)).rejects.toThrow(
          KeyringControllerErrorMessage.KeyringNotFound,
        );
        expect(fn).not.toHaveBeenCalled();
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

    describe('addNewKeyring', () => {
      it('should call addNewKeyring', async () => {
        const mockKeyringMetadata: KeyringMetadata = {
          id: 'mock-id',
          name: 'mock-keyring',
        };
        jest
          .spyOn(KeyringController.prototype, 'addNewKeyring')
          .mockImplementationOnce(async () => mockKeyringMetadata);

        await withController(
          { keyringBuilders: [keyringBuilderFactory(MockKeyring)] },
          async ({ controller, messenger }) => {
            const mockKeyringOptions = {};

            expect(
              await messenger.call(
                'KeyringController:addNewKeyring',
                MockKeyring.type,
                mockKeyringOptions,
              ),
            ).toStrictEqual(mockKeyringMetadata);

            expect(controller.addNewKeyring).toHaveBeenCalledWith(
              MockKeyring.type,
              mockKeyringOptions,
            );
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
        let callCount = 0;
        const noOp = async (): Promise<void> => {
          // No operation for subsequent calls
        };
        const persistAction = async (): Promise<void> => {
          await controller.persistAllKeyrings();
        };
        const actions: (() => Promise<void>)[] = [persistAction, noOp, noOp];
        const listener = jest.fn(async () => {
          callCount += 1;
          // Only execute persistAllKeyrings on the first call to prevent infinite loops
          const actionIndex = Math.min(callCount - 1, actions.length - 1);
          await actions[actionIndex]();
        });

        messenger.subscribe(
          'KeyringController:stateChange',
          // Cast to avoid misued-promise warning.
          listener as jest.Mocked<() => void>,
        );

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

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(
        // Skip vault creation and use static vault to get deterministic state snapshot
        { skipVaultCreation: true, state: { vault: createVault() } },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'includeInDebugSnapshot',
            ),
          ).toMatchInlineSnapshot(`
            {
              "isUnlocked": false,
            }
          `);
        },
      );
    });

    it('includes expected state in state logs', async () => {
      await withController(
        // Skip vault creation and use static vault to get deterministic state snapshot
        { skipVaultCreation: true, state: { vault: createVault() } },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'includeInStateLogs',
            ),
          ).toMatchInlineSnapshot(`
            {
              "isUnlocked": false,
              "keyrings": [],
            }
          `);
        },
      );
    });

    it('persists expected state', async () => {
      await withController(
        // Skip vault creation and use static vault to get deterministic state snapshot
        { skipVaultCreation: true, state: { vault: createVault() } },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'persist',
            ),
          ).toMatchInlineSnapshot(`
            {
              "vault": "{"data":"{\\"tag\\":{\\"key\\":{\\"password\\":\\"password123\\",\\"salt\\":\\"salt\\"},\\"iv\\":\\"iv\\"},\\"value\\":[{\\"type\\":\\"HD Key Tree\\",\\"data\\":{\\"mnemonic\\":[119,97,114,114,105,111,114,32,108,97,110,103,117,97,103,101,32,106,111,107,101,32,98,111,110,117,115,32,117,110,102,97,105,114,32,97,114,116,105,115,116,32,107,97,110,103,97,114,111,111,32,99,105,114,99,108,101,32,101,120,112,97,110,100,32,104,111,112,101,32,109,105,100,100,108,101,32,103,97,117,103,101],\\"numberOfAccounts\\":1,\\"hdPath\\":\\"m/44'/60'/0'/0\\"},\\"metadata\\":{\\"id\\":\\"01JXEFM7DAX2VJ0YFR4ESNY3GQ\\",\\"name\\":\\"\\"}}]}","iv":"iv","salt":"salt"}",
            }
          `);
        },
      );
    });

    it('exposes expected state to UI', async () => {
      await withController(
        // Skip vault creation and use static vault to get deterministic state snapshot
        { skipVaultCreation: true, state: { vault: createVault() } },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'usedInUi',
            ),
          ).toMatchInlineSnapshot(`
            {
              "isUnlocked": false,
              "keyrings": [],
            }
          `);
        },
      );
    });
  });

  describe('KeyringControllerError', () => {
    describe('error features', () => {
      it('should support error codes', () => {
        const error = new KeyringControllerError('Test error', {
          code: 'TEST_CODE',
        });

        expect(error.code).toBe('TEST_CODE');
        expect(error.message).toBe('Test error');
        expect(error.name).toBe('KeyringControllerError');
      });

      it('should support additional data', () => {
        const error = new KeyringControllerError('Test error', {
          context: { key: 'value', number: 42 },
        });

        expect(error.context).toStrictEqual({ key: 'value', number: 42 });
      });

      it('should support error chaining with cause', () => {
        const originalError = new Error('Original error');
        const error = new KeyringControllerError('Wrapped error', {
          cause: originalError,
        });

        expect(error.cause).toBe(originalError);
        expect(error.originalError).toBe(originalError);
      });

      it('should support backward compatibility with Error as second param', () => {
        const originalError = new Error('Original error');
        const error = new KeyringControllerError(
          'Wrapped error',
          originalError,
        );

        expect(error.cause).toBe(originalError);
        expect(error.originalError).toBe(originalError);
      });

      it('should serialize to JSON correctly', () => {
        const originalError = new Error('Original error');
        const error = new KeyringControllerError('Test error', {
          code: 'TEST_CODE',
          context: { key: 'value' },
          cause: originalError,
        });

        const json = error.toJSON();

        expect(json.name).toBe('KeyringControllerError');
        expect(json.message).toBe('Test error');
        expect(json.code).toBe('TEST_CODE');
        expect(json.context).toStrictEqual({ key: 'value' });
        expect(json.cause).toStrictEqual({
          name: 'Error',
          message: 'Original error',
          stack: originalError.stack,
        });
      });

      it('should serialize to JSON without cause if not present', () => {
        const error = new KeyringControllerError('Test error', {
          code: 'TEST_CODE',
        });

        const json = error.toJSON();

        expect(json.cause).toBeUndefined();
      });

      it('should convert to string with code', () => {
        const error = new KeyringControllerError('Test error', {
          code: 'TEST_CODE',
        });

        const str = error.toString();

        expect(str).toContain('KeyringControllerError');
        expect(str).toContain('Test error');
        expect(str).toContain('[TEST_CODE]');
      });

      it('should convert to string with cause', () => {
        const originalError = new Error('Original error');
        const error = new KeyringControllerError('Test error', {
          cause: originalError,
        });

        const str = error.toString();

        expect(str).toContain('KeyringControllerError: Test error');
        expect(str).toContain('Caused by: Error: Original error');
      });

      it('should convert to string with both code and cause', () => {
        const originalError = new Error('Original error');
        const error = new KeyringControllerError('Test error', {
          code: 'TEST_CODE',
          cause: originalError,
        });

        const str = error.toString();

        expect(str).toContain('KeyringControllerError: Test error');
        expect(str).toContain('[TEST_CODE]');
        expect(str).toContain('Caused by: Error: Original error');
      });
    });
  });

  describe('error handling', () => {
    describe('when hardware wallet throws custom error', () => {
      it('should preserve hardware wallet error in originalError property', async () => {
        const mockHardwareKeyringBuilder = keyringBuilderFactory(
          MockHardwareKeyring as unknown as KeyringClass,
        );

        await withController(
          {
            keyringBuilders: [mockHardwareKeyringBuilder],
          },
          async ({ controller }) => {
            // Add the hardware keyring
            await controller.addNewKeyring('Mock Hardware');
            // Get all accounts - the hardware wallet should be the second keyring
            const allAccounts = await controller.getAccounts();
            // Use the hardware wallet address (last one added)
            const hardwareAddress = allAccounts[allAccounts.length - 1];

            const typedData = {
              types: {
                EIP712Domain: [
                  { name: 'name', type: 'string' },
                  { name: 'version', type: 'string' },
                ],
                Message: [{ name: 'content', type: 'string' }],
              },
              primaryType: 'Message',
              domain: {
                name: 'Test',
                version: '1',
              },
              message: {
                content: 'Hello!',
              },
            };

            await expect(
              controller.signTypedMessage(
                { data: JSON.stringify(typedData), from: hardwareAddress },
                SignTypedDataVersion.V4,
              ),
            ).rejects.toThrow(KeyringControllerError);

            // Verify the error details by catching it explicitly
            let caughtError: unknown;
            try {
              await controller.signTypedMessage(
                { data: JSON.stringify(typedData), from: hardwareAddress },
                SignTypedDataVersion.V4,
              );
            } catch (error) {
              caughtError = error;
            }

            // Verify the error is a KeyringControllerError (wrapped by signTypedMessage)
            expect(caughtError).toBeInstanceOf(KeyringControllerError);

            const keyringError = caughtError as KeyringControllerError;

            // Verify the error message contains information about the hardware wallet error
            expect(keyringError.message).toContain(
              'Keyring Controller signTypedMessage',
            );
            expect(keyringError.message).toContain('HardwareWalletError');
            expect(keyringError.message).toContain(
              'User rejected the request on hardware device',
            );

            // Verify the original hardware wallet error is preserved in originalError
            expect(keyringError.cause).toBeInstanceOf(HardwareWalletError);
            expect(keyringError.cause?.message).toBe(
              'User rejected the request on hardware device',
            );
            expect(keyringError.cause?.name).toBe('HardwareWalletError');
            expect((keyringError.cause as HardwareWalletError).code).toBe(
              'USER_REJECTED',
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
  messenger: RootMessenger;
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
): void {
  jest
    .spyOn(keyringClass.prototype, 'getAccounts')
    .mockResolvedValue([account]);
  jest
    .spyOn(keyringClass.prototype, 'addAccounts')
    .mockResolvedValue([account]);
}

/**
 * Build a root messenger.
 *
 * @returns The root messenger.
 */
function buildRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Build a messenger for the keyring controller.
 *
 * @param messenger - An optional root messenger to use as the base for the
 * controller messenger
 * @returns The keyring controller restricted messenger.
 */
function buildKeyringControllerMessenger(
  messenger = buildRootMessenger(),
): Messenger<
  'KeyringController',
  KeyringControllerActions,
  KeyringControllerEvents,
  typeof messenger
> {
  return new Messenger<
    'KeyringController',
    KeyringControllerActions,
    KeyringControllerEvents,
    typeof messenger
  >({ namespace: 'KeyringController', parent: messenger });
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
  const messenger = buildRootMessenger();
  const keyringControllerMessenger = buildKeyringControllerMessenger(messenger);
  const controller = new KeyringController({
    encryptor: encryptor.asEncryptor(),
    messenger: keyringControllerMessenger,
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
