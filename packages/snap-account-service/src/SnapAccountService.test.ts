import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { SnapId } from '@metamask/snaps-sdk';

import type { SnapAccountServiceMessenger } from './SnapAccountService';
import { SnapAccountService } from './SnapAccountService';

const MOCK_KEYRING_SNAP_ID = 'npm:@metamask/keyring-snap' as SnapId;
const MOCK_OTHER_SNAP_ID = 'npm:@metamask/other-snap' as SnapId;

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SnapAccountServiceMessenger>,
  MessengerEvents<SnapAccountServiceMessenger>
>;

/**
 * Builds a minimal snap object for use in tests.
 *
 * @param id - The snap ID.
 * @param initialPermissions - The snap's initial permissions.
 * @returns A minimal snap object.
 */
function buildSnap(
  id: SnapId,
  initialPermissions: Record<string, unknown>,
): {
  id: SnapId;
  initialPermissions: Record<string, unknown>;
  version: string;
  enabled: boolean;
  blocked: boolean;
} {
  return {
    id,
    initialPermissions,
    version: '1.0.0',
    enabled: true,
    blocked: false,
  };
}

/**
 * Sets up the service under test with its required mocks.
 *
 * @param args - The setup arguments.
 * @param args.snaps - The snaps that `SnapController:getRunnableSnaps` will return.
 * @returns The service and its messengers.
 */
function setup({ snaps }: { snaps: ReturnType<typeof buildSnap>[] }): {
  service: SnapAccountService;
  rootMessenger: RootMessenger;
  messenger: SnapAccountServiceMessenger;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: SnapAccountServiceMessenger = new Messenger({
    namespace: 'SnapAccountService',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: ['SnapController:getRunnableSnaps'],
    messenger,
  });
  rootMessenger.registerActionHandler(
    'SnapController:getRunnableSnaps',
    jest.fn().mockReturnValue(snaps),
  );

  const service = new SnapAccountService({ messenger });

  return { service, rootMessenger, messenger };
}

describe('SnapAccountService', () => {
  describe('init', () => {
    it('resolves without throwing when there are no snaps', async () => {
      const { service } = setup({ snaps: [] });

      expect(await service.init()).toBeUndefined();
    });

    it('stores snap IDs that have the endowment:keyring permission', async () => {
      const { service } = setup({
        snaps: [buildSnap(MOCK_KEYRING_SNAP_ID, { 'endowment:keyring': {} })],
      });

      await service.init();

      expect(service.getSnaps().has(MOCK_KEYRING_SNAP_ID)).toBe(true);
    });

    it('does not store snap IDs that lack the endowment:keyring permission', async () => {
      const { service } = setup({
        snaps: [buildSnap(MOCK_OTHER_SNAP_ID, {})],
      });

      await service.init();

      expect(service.getSnaps().has(MOCK_OTHER_SNAP_ID)).toBe(false);
    });

    it('handles a mix of keyring and non-keyring snaps', async () => {
      const { service } = setup({
        snaps: [
          buildSnap(MOCK_KEYRING_SNAP_ID, { 'endowment:keyring': {} }),
          buildSnap(MOCK_OTHER_SNAP_ID, {}),
        ],
      });

      await service.init();

      expect(service.getSnaps().has(MOCK_KEYRING_SNAP_ID)).toBe(true);
      expect(service.getSnaps().has(MOCK_OTHER_SNAP_ID)).toBe(false);
      expect(service.getSnaps().size).toBe(1);
    });
  });

  describe('getSnaps', () => {
    it('returns the set of account management snap IDs via the messenger action', async () => {
      const { rootMessenger, service } = setup({
        snaps: [buildSnap(MOCK_KEYRING_SNAP_ID, { 'endowment:keyring': {} })],
      });

      await service.init();

      expect(
        rootMessenger
          .call('SnapAccountService:getSnaps')
          .has(MOCK_KEYRING_SNAP_ID),
      ).toBe(true);
    });
  });
});
