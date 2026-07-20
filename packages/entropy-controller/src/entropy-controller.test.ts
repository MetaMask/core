import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { EntropyControllerMessenger } from './entropy-controller';
import { EntropyController } from './entropy-controller';
import { toEntropyId } from './utils';

// Stable test secrets
const HD_MNEMONIC = new TextEncoder().encode(
  'test test test test test test test test test test test junk',
);
const PRIVATE_KEY_HEX =
  '4af1bceebf7f3634ec3cff8a2c38e51178d5d4ce585c52d6043e5e2cc3f1d3e1';
const PRIVATE_KEY_BYTES = Uint8Array.from(
  PRIVATE_KEY_HEX.match(/../gu)!.map((b) => parseInt(b, 16)),
);

type KeyringStub = {
  type: string;
  metadata: { id: string; name: string };
  /** HD keyring: mnemonic bytes, or null if not yet initialised. */
  mnemonic?: Uint8Array | null;
  /** Accounts held by this keyring. `id` and `privateKey` are only relevant for Simple keyrings. */
  accounts: { address: string; id?: string; privateKey?: string }[];
};

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<EntropyControllerMessenger>,
  MessengerEvents<EntropyControllerMessenger>
>;

type Mocks = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  KeyringController: {
    getState: jest.Mock;
    withKeyringV2Unsafe: jest.Mock;
  };
};

async function setup({
  keyrings = [],
  options = {},
}: {
  keyrings?: KeyringStub[];
  options?: Partial<ConstructorParameters<typeof EntropyController>[0]>;
} = {}): Promise<{
  controller: EntropyController;
  rootMessenger: RootMessenger;
  messenger: EntropyControllerMessenger;
  mocks: Mocks;
}> {
  const mocks: Mocks = {
    KeyringController: {
      getState: jest.fn(),
      withKeyringV2Unsafe: jest.fn(),
    },
  };

  mocks.KeyringController.getState.mockImplementation(
    () => ({
      keyrings: keyrings.map((k) => ({
        type: k.type,
        accounts: k.accounts.map((a) => a.address),
        metadata: k.metadata,
      })),
      isUnlocked: true,
    }) as never,
  );

  mocks.KeyringController.withKeyringV2Unsafe.mockImplementation(
    async (
      selector: { id: string },
      operation: (payload: {
        keyring: unknown;
        metadata: unknown;
      }) => Promise<unknown>,
    ) => {
      const stub = keyrings.find((k) => k.metadata.id === selector.id);
      return operation({
        keyring: {
          mnemonic: stub?.mnemonic ?? null,
          getAccounts: async () =>
            (stub?.accounts ?? [])
              .filter((a) => a.id !== undefined)
              .map(({ id }) => ({ id })),
          exportAccount: async (accountId: string) => {
            const account = stub?.accounts.find((a) => a.id === accountId);
            return {
              type: 'private-key',
              encoding: 'hexadecimal',
              privateKey: account?.privateKey ?? '',
            };
          },
        },
        metadata: { id: selector.id, name: '' },
      });
    },
  );

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    MessengerActions<EntropyControllerMessenger>,
    MessengerEvents<EntropyControllerMessenger>
  >({ namespace: MOCK_ANY_NAMESPACE });

  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mocks.KeyringController.getState,
  );

  rootMessenger.registerActionHandler(
    'KeyringController:withKeyringV2Unsafe',
    mocks.KeyringController.withKeyringV2Unsafe,
  );

  const messenger = new Messenger<
    'EntropyController',
    MessengerActions<EntropyControllerMessenger>,
    MessengerEvents<EntropyControllerMessenger>
  >({
    namespace: 'EntropyController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [
      'KeyringController:getState',
      'KeyringController:withKeyringV2Unsafe',
    ],
    events: [
      'KeyringController:unlock',
      'KeyringController:keyringAdded',
      'KeyringController:keyringRemoved',
    ],
  });

  const controller = new EntropyController({
    messenger,
    ...options,
  });

  return { controller, rootMessenger, messenger, mocks };
}


describe('EntropyController', () => {
  describe('constructor', () => {
    it('accepts initial state', async () => {
      const givenState = {
        entropySources: {
          'entropy-1': {
            type: 'bip44:srp' as const,
            metadata: {},
          },
        },
      };

      const { controller } = await setup({ options: { state: givenState } });

      expect(controller.state).toStrictEqual(givenState);
    });

    it('fills in missing initial state with defaults', async () => {
      const { controller } = await setup();

      expect(controller.state).toMatchInlineSnapshot(`
        {
          "entropySources": {},
        }
      `);
    });
  });

  describe('syncEntropies', () => {
    it('populates entropySources from an HD keyring', async () => {
      const keyringId = 'hd-keyring-id';
      const expectedId = await toEntropyId(HD_MNEMONIC, 'bip44:srp');

      const { controller } = await setup({
        keyrings: [
          {
            type: 'HD Key Tree',
            metadata: { id: keyringId, name: '' },
            mnemonic: HD_MNEMONIC,
            accounts: [{ address: '0xabc' }],
          },
        ],
      });

      await controller.syncEntropies();

      expect(controller.state.entropySources).toStrictEqual({
        [expectedId]: {
          type: 'bip44:srp',
          metadata: { legacyEntropySource: keyringId },
        },
      });
    });

    it('populates entropySources from a Simple keyring', async () => {
      const keyringId = 'simple-keyring-id';
      const accountId = 'account-uuid-1';
      const expectedId = await toEntropyId(PRIVATE_KEY_BYTES, 'raw:private-key');

      const { controller } = await setup({
        keyrings: [
          {
            type: 'Simple Key Pair',
            metadata: { id: keyringId, name: '' },
            accounts: [{ address: '0xdef', id: accountId, privateKey: PRIVATE_KEY_HEX }],
          },
        ],
      });

      await controller.syncEntropies();

      expect(controller.state.entropySources).toStrictEqual({
        [expectedId]: {
          type: 'raw:private-key',
          metadata: { legacyEntropySource: keyringId },
        },
      });
    });

    it('handles a Simple keyring with multiple accounts', async () => {
      const keyringId = 'simple-keyring-id';
      const secondKeyHex =
        '1111111111111111111111111111111111111111111111111111111111111111';
      const secondKeyBytes = Uint8Array.from(
        secondKeyHex.match(/../gu)!.map((b) => parseInt(b, 16)),
      );
      const expectedId1 = await toEntropyId(PRIVATE_KEY_BYTES, 'raw:private-key');
      const expectedId2 = await toEntropyId(secondKeyBytes, 'raw:private-key');

      const { controller } = await setup({
        keyrings: [
          {
            type: 'Simple Key Pair',
            metadata: { id: keyringId, name: '' },
            accounts: [
              { address: '0xaaa', id: 'account-1', privateKey: PRIVATE_KEY_HEX },
              { address: '0xbbb', id: 'account-2', privateKey: secondKeyHex },
            ],
          },
        ],
      });

      await controller.syncEntropies();

      expect(controller.state.entropySources).toStrictEqual({
        [expectedId1]: {
          type: 'raw:private-key',
          metadata: { legacyEntropySource: keyringId },
        },
        [expectedId2]: {
          type: 'raw:private-key',
          metadata: { legacyEntropySource: keyringId },
        },
      });
    });

    it('ignores keyrings that do not own entropy', async () => {
      const { controller } = await setup({
        keyrings: [
          {
            type: 'Snap Keyring',
            metadata: { id: 'snap-id', name: '' },
            accounts: [{ address: '0xabc' }],
          },
        ],
      });

      await controller.syncEntropies();

      expect(controller.state.entropySources).toStrictEqual({});
    });

    it('skips an HD keyring whose mnemonic is not yet initialised', async () => {
      const keyringId = 'hd-keyring-id';

      const { controller } = await setup({
        keyrings: [
          {
            type: 'HD Key Tree',
            metadata: { id: keyringId, name: '' },
            mnemonic: null,
            accounts: [],
          },
        ],
      });

      await controller.syncEntropies();

      expect(controller.state.entropySources).toStrictEqual({});
    });

    it('replaces the entire entropySources map on each call', async () => {
      const keyringId = 'hd-keyring-id';
      const expectedId = await toEntropyId(HD_MNEMONIC, 'bip44:srp');

      const { controller } = await setup({
        options: {
          state: {
            entropySources: {
              'stale-id': {
                type: 'bip44:srp',
                metadata: { legacyEntropySource: 'old-keyring-id' },
              },
            },
          },
        },
        keyrings: [
          {
            type: 'HD Key Tree',
            metadata: { id: keyringId, name: '' },
            mnemonic: HD_MNEMONIC,
            accounts: [{ address: '0xabc' }],
          },
        ],
      });

      await controller.syncEntropies();

      expect(controller.state.entropySources).toStrictEqual({
        [expectedId]: {
          type: 'bip44:srp',
          metadata: { legacyEntropySource: keyringId },
        },
      });
      expect(controller.state.entropySources['stale-id']).toBeUndefined();
    });

    it('does nothing when the keyring is locked', async () => {
      const keyringId = 'hd-keyring-id';

      const { controller, mocks } = await setup({
        keyrings: [
          {
            type: 'HD Key Tree',
            metadata: { id: keyringId, name: '' },
            mnemonic: HD_MNEMONIC,
            accounts: [{ address: '0xabc' }],
          },
        ],
      });

      mocks.KeyringController.getState.mockReturnValueOnce({
        keyrings: [],
        isUnlocked: false,
      });

      await controller.syncEntropies();

      expect(controller.state.entropySources).toStrictEqual({});
    });

    it('synchronizes automatically when KeyringController emits unlock', async () => {
      const keyringId = 'hd-keyring-id';
      const expectedId = await toEntropyId(HD_MNEMONIC, 'bip44:srp');

      const { controller, rootMessenger } = await setup({
        keyrings: [
          {
            type: 'HD Key Tree',
            metadata: { id: keyringId, name: '' },
            mnemonic: HD_MNEMONIC,
            accounts: [{ address: '0xabc' }],
          },
        ],
      });

      // Spy before publishing so we can await the async sync triggered by the event.
      const syncSpy = jest.spyOn(controller, 'syncEntropies');
      rootMessenger.publish('KeyringController:unlock');
      await syncSpy.mock.results[0]?.value;

      expect(controller.state.entropySources).toStrictEqual({
        [expectedId]: {
          type: 'bip44:srp',
          metadata: { legacyEntropySource: keyringId },
        },
      });
    });
  });

  describe('keyringAdded', () => {
    it('merges the new HD keyring into entropySources', async () => {
      const keyringId = 'new-hd-keyring-id';
      const expectedId = await toEntropyId(HD_MNEMONIC, 'bip44:srp');

      const { controller, rootMessenger } = await setup({
        keyrings: [
          {
            type: 'HD Key Tree',
            metadata: { id: keyringId, name: '' },
            mnemonic: HD_MNEMONIC,
            accounts: [{ address: '0xabc' }],
          },
        ],
      });

      const syncSpy = jest.spyOn(controller, 'syncEntropies');

      rootMessenger.publish('KeyringController:keyringAdded', {
        type: 'HD Key Tree',
        accounts: ['0xabc'],
        metadata: { id: keyringId, name: '' },
      });

      // Wait for the async merge to complete
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(controller.state.entropySources[expectedId]).toStrictEqual({
        type: 'bip44:srp',
        metadata: { legacyEntropySource: keyringId },
      });
      // syncEntropies should NOT have been called (incremental, not full rescan)
      expect(syncSpy).not.toHaveBeenCalled();
    });

    it('ignores keyrings that do not own entropy', async () => {
      const { controller, rootMessenger } = await setup();

      rootMessenger.publish('KeyringController:keyringAdded', {
        type: 'Snap Keyring',
        accounts: [],
        metadata: { id: 'snap-id', name: '' },
      });

      await new Promise(process.nextTick);

      expect(controller.state.entropySources).toStrictEqual({});
    });

    it('does nothing when the vault is locked', async () => {
      const keyringId = 'hd-keyring-id';
      const { controller, rootMessenger, mocks } = await setup({
        keyrings: [
          {
            type: 'HD Key Tree',
            metadata: { id: keyringId, name: '' },
            mnemonic: HD_MNEMONIC,
            accounts: [{ address: '0xabc' }],
          },
        ],
      });

      mocks.KeyringController.getState.mockReturnValueOnce({
        keyrings: [],
        isUnlocked: false,
      });

      rootMessenger.publish('KeyringController:keyringAdded', {
        type: 'HD Key Tree',
        accounts: ['0xabc'],
        metadata: { id: keyringId, name: '' },
      });

      await new Promise(process.nextTick);

      expect(controller.state.entropySources).toStrictEqual({});
    });
  });

  describe('keyringRemoved', () => {
    it('removes all entropy sources belonging to the removed keyring', async () => {
      const keyringId = 'hd-keyring-id';
      const expectedId = await toEntropyId(HD_MNEMONIC, 'bip44:srp');

      const { controller, rootMessenger } = await setup({
        options: {
          state: {
            entropySources: {
              [expectedId]: {
                type: 'bip44:srp',
                metadata: { legacyEntropySource: keyringId },
              },
              'other-entropy-id': {
                type: 'bip44:srp',
                metadata: { legacyEntropySource: 'other-keyring-id' },
              },
            },
          },
        },
      });

      rootMessenger.publish('KeyringController:keyringRemoved', {
        id: keyringId,
        name: '',
      });

      expect(controller.state.entropySources[expectedId]).toBeUndefined();
      expect(
        controller.state.entropySources['other-entropy-id'],
      ).toBeDefined();
    });

    it('does nothing when no entropy sources match the removed keyring', async () => {
      const { controller, rootMessenger } = await setup();

      rootMessenger.publish('KeyringController:keyringRemoved', {
        id: 'unknown-keyring-id',
        name: '',
      });

      expect(controller.state.entropySources).toStrictEqual({});
    });
  });

  describe('metadata', () => {
    it('does not include entropy sources in debug snapshots', async () => {
      const { controller } = await setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes entropy sources in state logs', async () => {
      const { controller } = await setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "entropySources": {},
        }
      `);
    });

    it('persists entropy sources', async () => {
      const { controller } = await setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "entropySources": {},
        }
      `);
    });

    it('exposes entropy sources to UI', async () => {
      const { controller } = await setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "entropySources": {},
        }
      `);
    });
  });
});
