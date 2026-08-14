import {
  AccountWalletType,
  toAccountGroupId,
  toAccountWalletId,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type { ImportContext } from './import.js';
import { importState } from './import.js';
import { AccountWalletPrivateKeyEncoding } from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';
import {
  makeAccountTreePayload,
  makeLocalKeyringWallet,
  makeLocalMnemonicWallet,
  makePayloadMnemonicWallet,
  makePayloadPrivateKeyWallet,
} from './tests/helpers.js';
import { encodeBytes } from './utils.js';

// Valid 20-byte hex addresses for use with getUUIDFromAddressOfNormalAccount.
const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ADDR_C = '0xcccccccccccccccccccccccccccccccccccccccc';

const MOCK_ENTROPY_ID = 'mock-entropy-id';
const MOCK_HD_WALLET_ID = toMultichainAccountWalletId(MOCK_ENTROPY_ID);
const MOCK_HD_GROUP_ID_0 = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 0);
const MOCK_HD_GROUP_ID_1 = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 1);
const MOCK_PRIVATE_KEY_WALLET_ID = toAccountWalletId(
  AccountWalletType.Keyring,
  KeyringTypes.simple,
);

const TEST_MNEMONIC = encodeBytes(
  new TextEncoder().encode(
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  ),
);
const MOCK_PRIVATE_KEY_HEX_STRING = '0xdeadbeef';

const MOCK_PRIVATE_KEY_B58_STRING = '5Kb8kLf9z...';
const MOCK_PRIVATE_KEY_B58_BYTES = encodeBytes(
  new TextEncoder().encode(MOCK_PRIVATE_KEY_B58_STRING),
);

function makeHdWalletState(): AccountTreeControllerState['accountTree']['wallets'] {
  return makeLocalMnemonicWallet(MOCK_ENTROPY_ID, [
    { groupIndex: 0, name: 'Account 1', accounts: ['account-1'] },
    { groupIndex: 1, name: 'Account 2', accounts: ['account-2'] },
  ]);
}

function makeHdWalletStateWithOneGroup(): AccountTreeControllerState['accountTree']['wallets'] {
  return makeLocalMnemonicWallet(MOCK_ENTROPY_ID, [
    { groupIndex: 0, name: 'Account 1', accounts: ['account-1'] },
  ]);
}

const MNEMONIC_PAYLOAD = makeAccountTreePayload(
  makePayloadMnemonicWallet(MOCK_ENTROPY_ID, 'My Renamed Wallet', [
    { groupIndex: 0, name: 'Renamed Account 1', pinned: true },
    { groupIndex: 1, name: 'Renamed Account 2', hidden: true },
  ]),
);

/**
 * Creates an ImportContext with individual jest mocks per action.
 *
 * `walletsRef.current` can be mutated by tests to simulate state changes that
 * happen during an import (e.g., wallet creation events updating the tree).
 *
 * @param options - Setup options.
 * @param options.wallets - Initial wallet state (default: empty).
 * @returns context, mocks (per-action jest.fn()s), and the mutable walletsRef.
 */
function setup({
  wallets = {} as AccountTreeControllerState['accountTree']['wallets'],
}: {
  wallets?: AccountTreeControllerState['accountTree']['wallets'];
} = {}): {
  context: ImportContext;
  /* eslint-disable @typescript-eslint/naming-convention */
  mocks: {
    KeyringController: {
      withKeyringV2Unsafe: jest.Mock;
      withController: jest.Mock;
    };
    MultichainAccountService: {
      createMultichainAccountWallet: jest.Mock;
      createMultichainAccountGroups: jest.Mock;
    };
    setters: {
      setWalletName: jest.Mock;
      setAccountGroupName: jest.Mock;
      setAccountGroupPinned: jest.Mock;
      setAccountGroupHidden: jest.Mock;
    };
  };
  /* eslint-enable @typescript-eslint/naming-convention */
  walletsRef: { current: AccountTreeControllerState['accountTree']['wallets'] };
} {
  const walletsRef = { current: wallets };

  const mocks = {
    KeyringController: {
      withKeyringV2Unsafe: jest.fn(),
      withController: jest.fn(),
    },
    MultichainAccountService: {
      createMultichainAccountWallet: jest.fn(),
      createMultichainAccountGroups: jest.fn().mockResolvedValue(undefined),
    },
    setters: {
      setWalletName: jest.fn(),
      setAccountGroupName: jest.fn(),
      setAccountGroupPinned: jest.fn(),
      setAccountGroupHidden: jest.fn(),
    },
  };

  const messenger = {
    call: jest.fn().mockImplementation((action: string, ...args: unknown[]) => {
      switch (action) {
        case 'KeyringController:withKeyringV2Unsafe':
          return mocks.KeyringController.withKeyringV2Unsafe(...args);
        case 'KeyringController:withController':
          return mocks.KeyringController.withController(...args);
        case 'MultichainAccountService:createMultichainAccountWallet':
          return mocks.MultichainAccountService.createMultichainAccountWallet(
            ...args,
          );
        case 'MultichainAccountService:createMultichainAccountGroups':
          return mocks.MultichainAccountService.createMultichainAccountGroups(
            ...args,
          );
        default:
          return undefined;
      }
    }),
  } as unknown as AccountTreeControllerMessenger;

  const context: ImportContext = {
    getState: () => ({
      accountTree: { wallets: walletsRef.current },
      selectedAccountGroup: '',
      isAccountTreeSyncingInProgress: false,
      hasAccountTreeSyncingSyncedAtLeastOnce: false,
      accountGroupsMetadata: {},
      accountWalletsMetadata: {},
    }),
    messenger,
    setWalletName: mocks.setters.setWalletName,
    setAccountGroupName: mocks.setters.setAccountGroupName,
    setAccountGroupPinned: mocks.setters.setAccountGroupPinned,
    setAccountGroupHidden: mocks.setters.setAccountGroupHidden,
  };

  return { context, mocks, walletsRef };
}

function makeWithKeyringV2UnsafeMock(keyring: unknown): jest.Mock {
  return jest
    .fn()
    .mockImplementation(
      async (_selector: unknown, fn: (ctx: { keyring: unknown }) => unknown) =>
        fn({ keyring }),
    );
}

type WithControllerFn = (ctx: {
  keyrings: { keyring: { type: string }; keyringV2: unknown }[];
  addNewKeyring: jest.Mock;
}) => Promise<unknown>;

function makeWithControllerMock({
  existingKeyringV2,
  newKeyringV2,
}: {
  existingKeyringV2?: unknown;
  newKeyringV2?: unknown;
} = {}): jest.Mock {
  return jest.fn().mockImplementation(async (fn: WithControllerFn) => {
    const keyrings = existingKeyringV2
      ? [
          {
            keyring: { type: KeyringTypes.simple },
            keyringV2: existingKeyringV2,
          },
        ]
      : [];
    const addNewKeyring = jest.fn().mockResolvedValue({
      keyring: { type: KeyringTypes.simple },
      keyringV2: newKeyringV2,
    });
    return fn({ keyrings, addNewKeyring });
  });
}

async function importSnapshot(
  context: ImportContext,
  payload: unknown,
): ReturnType<typeof importState> {
  return importState(context, await AccountTreeSnapshot.deserialize(payload));
}

describe('importState', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('mnemonic wallets', () => {
    it('applies metadata to existing groups when the wallet already exists locally', async () => {
      const { context, mocks } = setup({ wallets: makeHdWalletState() });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => MOCK_ENTROPY_ID,
        },
      );

      await importSnapshot(context, MNEMONIC_PAYLOAD);

      expect(mocks.setters.setWalletName).toHaveBeenCalledWith(
        MOCK_HD_WALLET_ID,
        'My Renamed Wallet',
      );
      expect(mocks.setters.setAccountGroupName).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_0,
        'Renamed Account 1',
      );
      expect(mocks.setters.setAccountGroupPinned).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_0,
        true,
      );
      expect(mocks.setters.setAccountGroupHidden).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_0,
        false,
      );
      expect(mocks.setters.setAccountGroupName).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_1,
        'Renamed Account 2',
      );
      expect(mocks.setters.setAccountGroupPinned).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_1,
        false,
      );
      expect(mocks.setters.setAccountGroupHidden).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_1,
        true,
      );
    });

    it('skips non-mnemonic wallets when searching for a matching entropy source', async () => {
      const privateKeyOnlyWallets = makeLocalKeyringWallet(
        KeyringTypes.simple,
        [],
        'Imported',
      );
      const { context, mocks } = setup({ wallets: privateKeyOnlyWallets });

      // No mnemonic in payload -> will early-return after not finding the wallet.
      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadMnemonicWallet('entropy-only', 'X', []),
        ),
      );
      expect(mocks.setters.setWalletName).not.toHaveBeenCalled();
    });

    it('skips import when no local wallet matches and no mnemonic is in the payload', async () => {
      const { context, mocks } = setup({ wallets: makeHdWalletState() });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => 'different-entropy-id',
        },
      );

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadMnemonicWallet('unknown-entropy', 'Unknown', []),
        ),
      );
      expect(mocks.setters.setWalletName).not.toHaveBeenCalled();
    });

    it('throws when createMultichainAccountWallet returns an id not found in state', async () => {
      const { context, mocks } = setup();
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => 'no-match-entropy',
        },
      );
      mocks.MultichainAccountService.createMultichainAccountWallet.mockResolvedValue(
        {
          id: 'entropy:wallet-that-does-not-exist',
        },
      );

      await expect(
        importSnapshot(
          context,
          makeAccountTreePayload(
            makePayloadMnemonicWallet('no-match-entropy', 'Wallet', [], {
              mnemonic: TEST_MNEMONIC,
            }),
          ),
        ),
      ).rejects.toThrow('wallet not found after creation');
    });

    it('throws when the wallet found after creation is not a mnemonic wallet', async () => {
      const { context, mocks, walletsRef } = setup();
      const fakeWalletId = toAccountWalletId(
        AccountWalletType.Keyring,
        KeyringTypes.simple,
      );

      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => 'no-match',
        },
      );
      mocks.MultichainAccountService.createMultichainAccountWallet.mockImplementation(
        async () => {
          // Inject a keyring wallet (not entropy) at the returned ID.
          walletsRef.current = makeLocalKeyringWallet(
            KeyringTypes.simple,
            [],
            'Not Mnemonic',
          );
          return { id: fakeWalletId };
        },
      );

      await expect(
        importSnapshot(
          context,
          makeAccountTreePayload(
            makePayloadMnemonicWallet('no-match', 'Wallet', [], {
              mnemonic: TEST_MNEMONIC,
            }),
          ),
        ),
      ).rejects.toThrow("wallet is not of type 'mnemonic'");
    });

    it('creates a new HD wallet when not found locally and mnemonic is provided', async () => {
      const { context, mocks, walletsRef } = setup();

      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => MOCK_ENTROPY_ID,
        },
      );
      mocks.MultichainAccountService.createMultichainAccountWallet.mockImplementation(
        async () => {
          walletsRef.current = makeHdWalletState();
          return { id: MOCK_HD_WALLET_ID };
        },
      );

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadMnemonicWallet(
            'unknown-entropy',
            'My Renamed Wallet',
            [{ groupIndex: 0, name: 'Account 1' }],
            { mnemonic: TEST_MNEMONIC },
          ),
        ),
      );

      expect(
        mocks.MultichainAccountService.createMultichainAccountWallet,
      ).toHaveBeenCalledWith(expect.objectContaining({ type: 'import' }));
      expect(mocks.setters.setWalletName).toHaveBeenCalledWith(
        MOCK_HD_WALLET_ID,
        'My Renamed Wallet',
      );
    });

    it('creates missing groups at the end of the payload list', async () => {
      const { context, mocks } = setup({
        wallets: makeHdWalletStateWithOneGroup(),
      });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => MOCK_ENTROPY_ID,
        },
      );

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadMnemonicWallet(MOCK_ENTROPY_ID, 'Wallet 1', [
            { groupIndex: 0, name: 'Account 1' },
            { groupIndex: 1, name: 'Account 2', pinned: true },
          ]),
        ),
      );

      expect(
        mocks.MultichainAccountService.createMultichainAccountGroups,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          entropySource: MOCK_ENTROPY_ID,
          fromGroupIndex: 1,
          toGroupIndex: 1,
        }),
      );
    });

    it('applies metadata to a newly created group via the post-creation pass', async () => {
      const { context, mocks, walletsRef } = setup({
        wallets: makeHdWalletStateWithOneGroup(),
      });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        { toEntropySourceId: async () => MOCK_ENTROPY_ID },
      );
      mocks.MultichainAccountService.createMultichainAccountGroups.mockImplementation(
        async () => {
          // Simulate group 1 appearing in the wallet tree after creation.
          walletsRef.current = makeHdWalletState();
        },
      );

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadMnemonicWallet(MOCK_ENTROPY_ID, 'Wallet 1', [
            { groupIndex: 0, name: 'Account 1' },
            { groupIndex: 1, name: 'New Account', pinned: true },
          ]),
        ),
      );

      expect(mocks.setters.setAccountGroupName).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_1,
        'New Account',
      );
      expect(mocks.setters.setAccountGroupPinned).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_1,
        true,
      );
    });

    it('applies metadata to pre-existing groups even when group creation throws', async () => {
      const { context, mocks } = setup({
        wallets: makeHdWalletStateWithOneGroup(),
      });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        { toEntropySourceId: async () => MOCK_ENTROPY_ID },
      );
      mocks.MultichainAccountService.createMultichainAccountGroups.mockRejectedValue(
        new Error('Snap keyring not ready'),
      );

      await expect(
        importSnapshot(
          context,
          makeAccountTreePayload(
            makePayloadMnemonicWallet(MOCK_ENTROPY_ID, 'Wallet 1', [
              { groupIndex: 0, name: 'Renamed Account 1', pinned: true },
              { groupIndex: 1, name: 'New Account' },
            ]),
          ),
        ),
      ).rejects.toThrow('Snap keyring not ready');

      // Group 0 already existed locally and must have received its metadata
      // before the creation loop threw.
      expect(mocks.setters.setAccountGroupName).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_0,
        'Renamed Account 1',
      );
      expect(mocks.setters.setAccountGroupPinned).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_0,
        true,
      );
    });

    it('creates missing groups in the middle of the payload list', async () => {
      const stateWithGap = makeLocalMnemonicWallet(MOCK_ENTROPY_ID, [
        { groupIndex: 0, name: 'Account 0', accounts: ['account-0'] },
        { groupIndex: 2, name: 'Account 2', accounts: ['account-2'] },
      ]);

      const { context, mocks } = setup({ wallets: stateWithGap });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => MOCK_ENTROPY_ID,
        },
      );

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadMnemonicWallet(MOCK_ENTROPY_ID, 'Wallet 1', [
            { groupIndex: 0, name: 'Account 0' },
            { groupIndex: 1, name: 'Account 1 (missing)' },
            { groupIndex: 2, name: 'Account 2' },
          ]),
        ),
      );

      expect(
        mocks.MultichainAccountService.createMultichainAccountGroups,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ fromGroupIndex: 1, toGroupIndex: 1 }),
      );
    });
  });

  it('skips metadata for a group absent from the wallet after creation without throwing', async () => {
    const { context, mocks, walletsRef } = setup();

    mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock({
      toEntropySourceId: async () => 'no-match',
    });
    mocks.MultichainAccountService.createMultichainAccountWallet.mockImplementation(
      async () => {
        // Wallet is created with only group 0; group 1 from the payload is absent.
        walletsRef.current = makeLocalMnemonicWallet(
          MOCK_ENTROPY_ID,
          [{ groupIndex: 0, name: 'Account 1', accounts: ['account-1'] }],
          'Wallet',
        );
        return { id: MOCK_HD_WALLET_ID };
      },
    );
    // createMultichainAccountGroups succeeds but leaves the wallet state unchanged
    // (group 1 is still absent after the call).
    mocks.MultichainAccountService.createMultichainAccountGroups.mockResolvedValue(
      undefined,
    );

    // Must not throw even though group 1 is absent from the wallet after creation.
    expect(
      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadMnemonicWallet(
            'no-match',
            'Wallet',
            [
              { groupIndex: 0, name: 'Account 1' },
              { groupIndex: 1, name: 'Missing Group' },
            ],
            { mnemonic: TEST_MNEMONIC },
          ),
        ),
      ),
    ).toBeUndefined();
    // Group 0 was present and must have received its metadata.
    expect(mocks.setters.setAccountGroupName).toHaveBeenCalledWith(
      MOCK_HD_GROUP_ID_0,
      'Account 1',
    );
    // Group 1 was never created, so no metadata should have been applied.
    expect(mocks.setters.setAccountGroupName).not.toHaveBeenCalledWith(
      MOCK_HD_GROUP_ID_1,
      'Missing Group',
    );
  });

  describe('private-key wallets', () => {
    it('applies metadata to an existing private-key account group', async () => {
      const accountId = getUUIDFromAddressOfNormalAccount(ADDR_A);
      const privateKeyGroupId = toAccountGroupId(
        MOCK_PRIVATE_KEY_WALLET_ID,
        ADDR_A,
      );

      const privateKeyWallets = makeLocalKeyringWallet(KeyringTypes.simple, [
        { address: ADDR_A, name: 'Imported 1', accounts: [accountId] },
      ]);

      const { context, mocks } = setup({ wallets: privateKeyWallets });

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadPrivateKeyWallet([
            {
              address: ADDR_A,
              name: 'Renamed Imported',
              pinned: true,
              value: null,
            },
          ]),
        ),
      );

      // The private-key wallet name is derived from its keyring type and is not
      // user-customisable, so import must never overwrite it.
      expect(mocks.setters.setWalletName).not.toHaveBeenCalled();
      expect(mocks.setters.setAccountGroupName).toHaveBeenCalledWith(
        privateKeyGroupId,
        'Renamed Imported',
      );
      expect(mocks.setters.setAccountGroupPinned).toHaveBeenCalledWith(
        privateKeyGroupId,
        true,
      );
      expect(mocks.setters.setAccountGroupHidden).toHaveBeenCalledWith(
        privateKeyGroupId,
        false,
      );
    });

    it('creates a new simple keyring when none exists (onboarding)', async () => {
      const newAccountId = getUUIDFromAddressOfNormalAccount(ADDR_B);

      const { context, mocks, walletsRef } = setup();

      const keyringV2 = {
        createAccounts: jest.fn().mockImplementation(async () => {
          walletsRef.current = makeLocalKeyringWallet(KeyringTypes.simple, [
            { address: ADDR_B, name: 'New Import', accounts: [newAccountId] },
          ]);
          return [{ id: newAccountId }];
        }),
      };
      // No existingKeyringV2 -> addNewKeyring will be called.
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: keyringV2,
      });

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadPrivateKeyWallet([
            { address: ADDR_B, name: 'New Import' },
          ]),
        ),
      );

      // addNewKeyring was invoked (keyrings array was empty).
      const [[fn]] = mocks.KeyringController.withController.mock.calls as [
        [WithControllerFn],
      ];
      const addNewKeyring = jest.fn().mockResolvedValue({
        keyring: { type: KeyringTypes.simple },
        keyringV2,
      });
      await fn({ keyrings: [], addNewKeyring });
      expect(addNewKeyring).toHaveBeenCalledWith(KeyringTypes.simple);
      expect(keyringV2.createAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'private-key:import',
          accountType: EthAccountType.Eoa,
          privateKey: MOCK_PRIVATE_KEY_HEX_STRING,
          encoding: AccountWalletPrivateKeyEncoding.Hexadecimal,
        }),
      );
    });

    it('reuses the existing simple keyring when one is already present', async () => {
      const newAccountId = getUUIDFromAddressOfNormalAccount(ADDR_B);

      const { context, mocks, walletsRef } = setup();

      const keyringV2 = {
        createAccounts: jest.fn().mockImplementation(async () => {
          walletsRef.current = makeLocalKeyringWallet(KeyringTypes.simple, [
            { address: ADDR_B, name: 'New Import', accounts: [newAccountId] },
          ]);
          return [{ id: newAccountId }];
        }),
      };
      // existingKeyringV2 provided -> addNewKeyring must NOT be called.
      mocks.KeyringController.withController = makeWithControllerMock({
        existingKeyringV2: keyringV2,
      });

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadPrivateKeyWallet([
            { address: ADDR_B, name: 'New Import' },
          ]),
        ),
      );

      // addNewKeyring was NOT invoked (existing keyring was reused).
      const [[fn]] = mocks.KeyringController.withController.mock.calls as [
        [WithControllerFn],
      ];
      const addNewKeyring = jest.fn();
      await fn({
        keyrings: [{ keyring: { type: KeyringTypes.simple }, keyringV2 }],
        addNewKeyring,
      });
      expect(addNewKeyring).not.toHaveBeenCalled();
      expect(keyringV2.createAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'private-key:import',
          accountType: EthAccountType.Eoa,
          privateKey: MOCK_PRIVATE_KEY_HEX_STRING,
          encoding: AccountWalletPrivateKeyEncoding.Hexadecimal,
        }),
      );
    });

    it('imports a private key when the account does not exist locally', async () => {
      const newAccountId = getUUIDFromAddressOfNormalAccount(ADDR_B);
      const privateKeyGroupId = toAccountGroupId(
        MOCK_PRIVATE_KEY_WALLET_ID,
        ADDR_B,
      );

      const { context, mocks, walletsRef } = setup();

      // Simulate the wallet tree being updated during the import and the
      // new account being returned by createAccounts.
      const keyringV2 = {
        createAccounts: jest.fn().mockImplementation(async () => {
          walletsRef.current = makeLocalKeyringWallet(KeyringTypes.simple, [
            { address: ADDR_B, name: 'New Import', accounts: [newAccountId] },
          ]);
          return [{ id: newAccountId }];
        }),
      };
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: keyringV2,
      });

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadPrivateKeyWallet([
            { address: ADDR_B, name: 'New Import' },
          ]),
        ),
      );

      expect(mocks.KeyringController.withController).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(keyringV2.createAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'private-key:import',
          accountType: EthAccountType.Eoa,
          privateKey: MOCK_PRIVATE_KEY_HEX_STRING,
          encoding: AccountWalletPrivateKeyEncoding.Hexadecimal,
        }),
      );
      expect(mocks.setters.setAccountGroupName).toHaveBeenCalledWith(
        privateKeyGroupId,
        'New Import',
      );
    });

    it('throws when createAccounts returns an empty account list', async () => {
      const { context, mocks } = setup();
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: { createAccounts: jest.fn().mockResolvedValue([]) },
      });

      await expect(
        importSnapshot(
          context,
          makeAccountTreePayload(
            makePayloadPrivateKeyWallet([{ address: ADDR_C, name: 'Fail' }]),
          ),
        ),
      ).rejects.toThrow('Failed to import private key for account');
    });

    it('throws when the keyring has no v2 interface', async () => {
      const { context, mocks } = setup();
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: undefined,
      });

      await expect(
        importSnapshot(
          context,
          makeAccountTreePayload(
            makePayloadPrivateKeyWallet([{ address: ADDR_C, name: 'Fail' }]),
          ),
        ),
      ).rejects.toThrow('Simple keyring has no v2 interface');
    });

    it('skips a private-key group whose value carries a non-EVM type', async () => {
      const { context, mocks } = setup();

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadPrivateKeyWallet([
            {
              address: ADDR_A,
              name: 'Bitcoin Account',
              value: {
                privateKey: MOCK_PRIVATE_KEY_B58_BYTES,
                encoding: AccountWalletPrivateKeyEncoding.Base58,
                type: 'bip122:p2wpkh',
              },
            },
          ]),
        ),
      );
      expect(mocks.KeyringController.withController).not.toHaveBeenCalled();
      expect(mocks.setters.setAccountGroupName).not.toHaveBeenCalled();
    });

    it('does not skip a private-key group whose value type is eip155:eoa', async () => {
      const { context, mocks } = setup();
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: { createAccounts: jest.fn().mockResolvedValue([]) },
      });

      // withController is called (not skipped), but createAccounts returns [] so it throws.
      await expect(
        importSnapshot(
          context,
          makeAccountTreePayload(
            makePayloadPrivateKeyWallet([
              {
                address: ADDR_A,
                name: 'EVM Account',
                value: { type: EthAccountType.Eoa },
              },
            ]),
          ),
        ),
      ).rejects.toThrow('Failed to import private key for account');
      expect(mocks.KeyringController.withController).toHaveBeenCalled();
    });

    it('skips a private-key group that has no value and account does not exist locally', async () => {
      const { context, mocks } = setup();

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadPrivateKeyWallet([
            { address: ADDR_C, name: 'Missing', value: null },
          ]),
        ),
      );
      expect(mocks.setters.setAccountGroupName).not.toHaveBeenCalled();
    });

    it('skips metadata when the local group is not found after import', async () => {
      const { context, mocks } = setup();
      // State stays empty -- the import succeeds but leaves no group in the tree.
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: {
          createAccounts: jest
            .fn()
            .mockResolvedValue([{ id: 'some-account-id' }]),
        },
      });

      await importSnapshot(
        context,
        makeAccountTreePayload(
          makePayloadPrivateKeyWallet([{ address: ADDR_C, name: 'Orphan' }]),
        ),
      );
      expect(mocks.setters.setAccountGroupName).not.toHaveBeenCalled();
    });
  });
});
