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
          'entropy:bip44:mnemonic:some-uuid': {
            type: 'bip44:mnemonic' as const,
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

  describe('addEntropy', () => {
    it('registers a mnemonic entropy source', async () => {
      const expectedId = await toEntropyId('bip44', 'mnemonic', HD_MNEMONIC);

      const { controller, rootMessenger } = await setup();

      rootMessenger.call('EntropyController:addEntropy', {
        type: 'bip44:mnemonic',
        id: expectedId,
      });

      expect(controller.state.entropySources).toStrictEqual({
        [expectedId]: { type: 'bip44:mnemonic' },
      });
    });

    it('merges new sources without replacing existing ones', async () => {
      const firstMnemonic = HD_MNEMONIC;
      const secondMnemonic = new TextEncoder().encode(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      );
      const firstId = await toEntropyId('bip44', 'mnemonic', firstMnemonic);
      const secondId = await toEntropyId('bip44', 'mnemonic', secondMnemonic);

      const { controller, rootMessenger } = await setup();

      rootMessenger.call('EntropyController:addEntropy', {
        type: 'bip44:mnemonic',
        id: firstId,
      });
      rootMessenger.call('EntropyController:addEntropy', {
        type: 'bip44:mnemonic',
        id: secondId,
      });

      expect(controller.state.entropySources).toStrictEqual({
        [firstId]: { type: 'bip44:mnemonic' },
        [secondId]: { type: 'bip44:mnemonic' },
      });
    });

    it('is idempotent — registering the same source twice yields one entry', async () => {
      const id = await toEntropyId('bip44', 'mnemonic', HD_MNEMONIC);

      const { controller, rootMessenger } = await setup();

      rootMessenger.call('EntropyController:addEntropy', {
        type: 'bip44:mnemonic',
        id,
      });
      rootMessenger.call('EntropyController:addEntropy', {
        type: 'bip44:mnemonic',
        id,
      });

      expect(Object.keys(controller.state.entropySources)).toHaveLength(1);
      expect(controller.state.entropySources[id]).toBeDefined();
    });
  });

  describe('removeEntropy', () => {
    it('removes an entropy source by its ID', async () => {
      const id = await toEntropyId('bip44', 'mnemonic', HD_MNEMONIC);

      const { controller, rootMessenger } = await setup({
        options: {
          state: {
            entropySources: {
              [id]: { type: 'bip44:mnemonic' },
              'entropy:bip44:mnemonic:other-uuid': { type: 'bip44:mnemonic' },
            },
          },
        },
      });

      rootMessenger.call('EntropyController:removeEntropy', id);

      expect(controller.state.entropySources[id]).toBeUndefined();
      expect(
        controller.state.entropySources['entropy:bip44:mnemonic:other-uuid'],
      ).toBeDefined();
    });

    it('does nothing when the ID does not exist', async () => {
      const { controller, rootMessenger } = await setup();

      rootMessenger.call(
        'EntropyController:removeEntropy',
        'entropy:bip44:mnemonic:nonexistent',
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
