/**
 * Round-trip integration tests for the export, serialize, deserialize, import pipeline.
 *
 * These tests exist to catch encoding/decoding mismatches that slip past unit tests because
 * the unit tests for export and import are isolated: export mocks never hit the struct
 * validator, and import fixtures are built directly without going through the encoder.
 *
 * A failure here means the wire format produced by `exportState` cannot be consumed by
 * `importState` without data loss, which is the central correctness property of this package.
 */
import {
  AccountWalletType,
  toAccountGroupId,
  toAccountWalletId,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { AccountGroupType } from '@metamask/account-api';
import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type { ExportContext } from './export.js';
import { exportState } from './export.js';
import type { ImportContext } from './import.js';
import { importState } from './import.js';
import { AccountWalletPrivateKeyEncoding } from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_ENTROPY_ID = 'stable-entropy-id';
const MOCK_HD_WALLET_ID = toMultichainAccountWalletId(MOCK_ENTROPY_ID);
const MOCK_HD_GROUP_ID_0 = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 0);
const MOCK_HD_WALLET_STATE: AccountTreeControllerState['accountTree']['wallets'] =
  {
    [MOCK_HD_WALLET_ID]: {
      id: MOCK_HD_WALLET_ID,
      type: AccountWalletType.Entropy,
      status: 'ready',
      groups: {
        [MOCK_HD_GROUP_ID_0]: {
          id: MOCK_HD_GROUP_ID_0,
          type: AccountGroupType.MultichainAccount,
          accounts: ['account-1'],
          metadata: {
            name: 'Account 1',
            entropy: { groupIndex: 0 },
            pinned: false,
            hidden: false,
            lastSelected: 0,
          },
        },
      },
      metadata: { name: 'Wallet 1', entropy: { id: MOCK_ENTROPY_ID } },
    },
  };

const MOCK_PRIVATE_KEY_WALLET_ID = toAccountWalletId(
  AccountWalletType.Keyring,
  KeyringTypes.simple,
);
const MOCK_PRIVATE_KEY_GROUP_ID = toAccountGroupId(
  MOCK_PRIVATE_KEY_WALLET_ID,
  '0xabc',
);
const MOCK_PRIVATE_KEY_WALLET_STATE: AccountTreeControllerState['accountTree']['wallets'] =
  {
    [MOCK_PRIVATE_KEY_WALLET_ID]: {
      id: MOCK_PRIVATE_KEY_WALLET_ID,
      type: AccountWalletType.Keyring,
      status: 'ready',
      groups: {
        [MOCK_PRIVATE_KEY_GROUP_ID]: {
          id: MOCK_PRIVATE_KEY_GROUP_ID,
          type: AccountGroupType.SingleAccount,
          accounts: ['account-private-key-1'],
          metadata: {
            name: 'Imported 1',
            pinned: false,
            hidden: false,
            lastSelected: 0,
          },
        },
      },
      metadata: {
        name: 'Imported Accounts',
        keyring: { type: KeyringTypes.simple },
      },
    },
  };

// ---------------------------------------------------------------------------
// Context factories
// ---------------------------------------------------------------------------

function makeExportContext(
  wallets: AccountTreeControllerState['accountTree']['wallets'],
  messengerActions: {
    withKeyringV2Unsafe?: jest.Mock;
    withKeyringV2?: jest.Mock;
    getAccount?: jest.Mock;
  } = {},
): ExportContext {
  const messenger = {
    call: jest.fn().mockImplementation((action: string, ...args: unknown[]) => {
      switch (action) {
        case 'KeyringController:getState':
          return { isUnlocked: true };
        case 'KeyringController:withKeyringV2Unsafe':
          return messengerActions.withKeyringV2Unsafe?.(...args);
        case 'KeyringController:withKeyringV2':
          return messengerActions.withKeyringV2?.(...args);
        case 'AccountsController:getAccount':
          return messengerActions.getAccount?.(...args);
        default:
          return undefined;
      }
    }),
  } as unknown as AccountTreeControllerMessenger;

  const state: AccountTreeControllerState = {
    accountTree: { wallets },
    selectedAccountGroup: '',
    isAccountTreeSyncingInProgress: false,
    hasAccountTreeSyncingSyncedAtLeastOnce: false,
    accountGroupsMetadata: {},
    accountWalletsMetadata: {},
  };

  return { getState: () => state, messenger };
}

function makeImportContext(
  walletsRef: { current: AccountTreeControllerState['accountTree']['wallets'] },
  messengerActions: {
    withKeyringV2Unsafe?: jest.Mock;
    withController?: jest.Mock;
    createMultichainAccountWallet?: jest.Mock;
    createMultichainAccountGroups?: jest.Mock;
  } = {},
): ImportContext {
  const messenger = {
    call: jest.fn().mockImplementation((action: string, ...args: unknown[]) => {
      switch (action) {
        case 'KeyringController:withKeyringV2Unsafe':
          return messengerActions.withKeyringV2Unsafe?.(...args);
        case 'KeyringController:withController':
          return messengerActions.withController?.(...args);
        case 'MultichainAccountService:createMultichainAccountWallet':
          return messengerActions.createMultichainAccountWallet?.(...args);
        case 'MultichainAccountService:createMultichainAccountGroups':
          return (
            messengerActions.createMultichainAccountGroups?.(...args) ??
            Promise.resolve()
          );
        default:
          return undefined;
      }
    }),
  } as unknown as AccountTreeControllerMessenger;

  return {
    getState: () => ({
      accountTree: { wallets: walletsRef.current },
      selectedAccountGroup: '',
      isAccountTreeSyncingInProgress: false,
      hasAccountTreeSyncingSyncedAtLeastOnce: false,
      accountGroupsMetadata: {},
      accountWalletsMetadata: {},
    }),
    messenger,
    setWalletName: jest.fn(),
    setAccountGroupName: jest.fn(),
    setAccountGroupPinned: jest.fn(),
    setAccountGroupHidden: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHdKeyringUnsafeHandler(
  entropySourceId: string,
  mnemonic: Uint8Array | null = null,
): jest.Mock {
  return jest
    .fn()
    .mockImplementation(
      async (
        _selector: unknown,
        callback: (ctx: { keyring: unknown }) => unknown,
      ) =>
        callback({
          keyring: {
            toEntropySourceId: async () => entropySourceId,
            mnemonic,
          },
        }),
    );
}

function makePrivateKeyExportHandler(result: {
  privateKey: string;
  encoding: string;
}): jest.Mock {
  return jest
    .fn()
    .mockImplementation(
      async (
        _selector: unknown,
        callback: (ctx: { keyring: unknown }) => unknown,
      ) => callback({ keyring: { exportAccount: async () => result } }),
    );
}

type WithControllerFn = (ctx: {
  keyrings: { keyring: { type: string }; keyringV2: unknown }[];
  addNewKeyring: jest.Mock;
}) => Promise<unknown>;

function makeWithControllerMock(keyringV2: unknown): jest.Mock {
  return jest.fn().mockImplementation(async (fn: WithControllerFn) => {
    const addNewKeyring = jest.fn().mockResolvedValue({
      keyring: { type: KeyringTypes.simple },
      keyringV2,
    });
    return fn({ keyrings: [], addNewKeyring });
  });
}

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe('export -> serialize -> deserialize -> import round-trip', () => {
  describe('mnemonic wallets', () => {
    it('preserves raw mnemonic bytes end-to-end', async () => {
      // Use a non-trivial byte sequence to catch encoding bugs (not all zeros).
      const originalMnemonic = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      // -- Export --
      const exportCtx = makeExportContext(MOCK_HD_WALLET_STATE, {
        withKeyringV2Unsafe: makeHdKeyringUnsafeHandler(
          MOCK_ENTROPY_ID,
          originalMnemonic,
        ),
      });
      const snapshot = await exportState(exportCtx, { includeSecrets: true });

      // -- Serialize: the result must pass assertAccountTreePayload validation --
      const serialized = snapshot.serialize();
      const deserialized = await AccountTreeSnapshot.deserialize(serialized);

      // -- Import: capture the mnemonic bytes handed to createMultichainAccountWallet --
      const walletsRef = {
        current: {} as AccountTreeControllerState['accountTree']['wallets'],
      };
      let capturedMnemonic: Uint8Array | undefined;
      const createMultichainAccountWallet = jest
        .fn()
        .mockImplementation(async (opts: { mnemonic: Uint8Array }) => {
          capturedMnemonic = opts.mnemonic;
          walletsRef.current = MOCK_HD_WALLET_STATE;
          return { id: MOCK_HD_WALLET_ID };
        });

      const importCtx = makeImportContext(walletsRef, {
        // Return a different entropy ID so import creates a new wallet.
        withKeyringV2Unsafe: makeHdKeyringUnsafeHandler('different-entropy-id'),
        createMultichainAccountWallet,
      });

      await importState(importCtx, deserialized);

      expect(createMultichainAccountWallet).toHaveBeenCalled();
      expect(capturedMnemonic).toStrictEqual(originalMnemonic);
    });

    it('assertAccountTreePayload accepts the exported payload without error', async () => {
      const exportCtx = makeExportContext(MOCK_HD_WALLET_STATE, {
        withKeyringV2Unsafe: makeHdKeyringUnsafeHandler(
          MOCK_ENTROPY_ID,
          new Uint8Array([0xab, 0xcd]),
        ),
      });
      const snapshot = await exportState(exportCtx, { includeSecrets: true });

      expect(
        await AccountTreeSnapshot.deserialize(snapshot.serialize()),
      ).toBeDefined();
    });
  });

  describe('private-key wallets', () => {
    it('preserves the private key string end-to-end', async () => {
      const originalPrivateKey = '0xdeadbeefcafebabe';

      // -- Export --
      const exportCtx = makeExportContext(MOCK_PRIVATE_KEY_WALLET_STATE, {
        getAccount: jest
          .fn()
          .mockReturnValue({ id: 'account-private-key-1', address: '0xabc' }),
        withKeyringV2: makePrivateKeyExportHandler({
          privateKey: originalPrivateKey,
          encoding: AccountWalletPrivateKeyEncoding.Hexadecimal,
        }),
      });
      const snapshot = await exportState(exportCtx, { includeSecrets: true });

      // -- Serialize + validate --
      const serialized = snapshot.serialize();
      const deserialized = await AccountTreeSnapshot.deserialize(serialized);

      // -- Import: capture the decoded private key passed to createAccounts --
      const createAccounts = jest
        .fn()
        .mockResolvedValue([{ id: 'new-account-private-key-1' }]);
      const walletsRef = {
        current: {} as AccountTreeControllerState['accountTree']['wallets'],
      };
      const importCtx = makeImportContext(walletsRef, {
        withController: makeWithControllerMock({ createAccounts }),
      });

      await importState(importCtx, deserialized);

      expect(createAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'private-key:import',
          accountType: EthAccountType.Eoa,
          privateKey: originalPrivateKey,
          encoding: AccountWalletPrivateKeyEncoding.Hexadecimal,
        }),
      );
    });

    it('assertAccountTreePayload accepts the exported payload without error', async () => {
      const exportCtx = makeExportContext(MOCK_PRIVATE_KEY_WALLET_STATE, {
        getAccount: jest
          .fn()
          .mockReturnValue({ id: 'account-private-key-1', address: '0xabc' }),
        withKeyringV2: makePrivateKeyExportHandler({
          privateKey: '0x1234',
          encoding: AccountWalletPrivateKeyEncoding.Hexadecimal,
        }),
      });
      const snapshot = await exportState(exportCtx, { includeSecrets: true });

      expect(
        await AccountTreeSnapshot.deserialize(snapshot.serialize()),
      ).toBeDefined();
    });
  });
});
