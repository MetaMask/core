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
const PRIVATE_KEY_BYTES = Uint8Array.from(
  '4af1bceebf7f3634ec3cff8a2c38e51178d5d4ce585c52d6043e5e2cc3f1d3e1'
    .match(/../gu)!
    .map((b) => parseInt(b, 16)),
);

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<EntropyControllerMessenger>,
  MessengerEvents<EntropyControllerMessenger>
>;

async function setup({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof EntropyController>[0]>;
} = {}): Promise<{
  controller: EntropyController;
  rootMessenger: RootMessenger;
}> {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const messenger = new Messenger<
    'EntropyController',
    MessengerActions<EntropyControllerMessenger>,
    MessengerEvents<EntropyControllerMessenger>
  >({
    namespace: 'EntropyController',
    parent: rootMessenger,
  });

  const controller = new EntropyController({ messenger, ...options });

  return { controller, rootMessenger };
}

describe('EntropyController', () => {
  describe('constructor', () => {
    it('accepts initial state', async () => {
      const givenState = {
        entropySources: {
          'entropy-1': {
            type: 'bip44:srp' as const,
            metadata: { legacyEntropySource: 'keyring-1' },
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

  describe('registerSource', () => {
    it('registers an HD keyring entropy source', async () => {
      const keyringId = 'hd-keyring-id';
      const expectedId = await toEntropyId(HD_MNEMONIC, 'bip44:srp');

      const { controller, rootMessenger } = await setup();

      await rootMessenger.call('EntropyController:registerSource', {
        type: 'bip44:srp',
        mnemonic: HD_MNEMONIC,
        metadata: { legacyEntropySource: keyringId },
      });

      expect(controller.state.entropySources).toStrictEqual({
        [expectedId]: {
          type: 'bip44:srp',
          metadata: { legacyEntropySource: keyringId },
        },
      });
    });

    it('registers a Simple keyring entropy source', async () => {
      const keyringId = 'simple-keyring-id';
      const expectedId = await toEntropyId(PRIVATE_KEY_BYTES, 'raw:private-key');

      const { controller, rootMessenger } = await setup();

      await rootMessenger.call('EntropyController:registerSource', {
        type: 'raw:private-key',
        privateKey: PRIVATE_KEY_BYTES,
        metadata: { legacyEntropySource: keyringId },
      });

      expect(controller.state.entropySources).toStrictEqual({
        [expectedId]: {
          type: 'raw:private-key',
          metadata: { legacyEntropySource: keyringId },
        },
      });
    });

    it('merges new sources without replacing existing ones', async () => {
      const hdKeyringId = 'hd-keyring-id';
      const simpleKeyringId = 'simple-keyring-id';
      const expectedHdId = await toEntropyId(HD_MNEMONIC, 'bip44:srp');
      const expectedSimpleId = await toEntropyId(
        PRIVATE_KEY_BYTES,
        'raw:private-key',
      );

      const { controller, rootMessenger } = await setup();

      await rootMessenger.call('EntropyController:registerSource', {
        type: 'bip44:srp',
        mnemonic: HD_MNEMONIC,
        metadata: { legacyEntropySource: hdKeyringId },
      });

      await rootMessenger.call('EntropyController:registerSource', {
        type: 'raw:private-key',
        privateKey: PRIVATE_KEY_BYTES,
        metadata: { legacyEntropySource: simpleKeyringId },
      });

      expect(controller.state.entropySources).toStrictEqual({
        [expectedHdId]: {
          type: 'bip44:srp',
          metadata: { legacyEntropySource: hdKeyringId },
        },
        [expectedSimpleId]: {
          type: 'raw:private-key',
          metadata: { legacyEntropySource: simpleKeyringId },
        },
      });
    });

    it('is idempotent — registering the same source twice yields one entry', async () => {
      const keyringId = 'hd-keyring-id';
      const expectedId = await toEntropyId(HD_MNEMONIC, 'bip44:srp');

      const { controller, rootMessenger } = await setup();

      await rootMessenger.call('EntropyController:registerSource', {
        type: 'bip44:srp',
        mnemonic: HD_MNEMONIC,
        metadata: { legacyEntropySource: keyringId },
      });

      await rootMessenger.call('EntropyController:registerSource', {
        type: 'bip44:srp',
        mnemonic: HD_MNEMONIC,
        metadata: { legacyEntropySource: keyringId },
      });

      expect(Object.keys(controller.state.entropySources)).toHaveLength(1);
      expect(controller.state.entropySources[expectedId]).toBeDefined();
    });
  });

  describe('unregisterSource', () => {
    it('removes all entropy sources belonging to the given keyring', async () => {
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

      rootMessenger.call('EntropyController:unregisterSource', keyringId);

      expect(controller.state.entropySources[expectedId]).toBeUndefined();
      expect(
        controller.state.entropySources['other-entropy-id'],
      ).toBeDefined();
    });

    it('does nothing when no sources match the keyring', async () => {
      const { controller, rootMessenger } = await setup();

      rootMessenger.call(
        'EntropyController:unregisterSource',
        'unknown-keyring-id',
      );

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
