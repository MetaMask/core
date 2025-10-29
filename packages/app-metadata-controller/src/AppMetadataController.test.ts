import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
} from '@metamask/messenger';

import {
  AppMetadataController,
  getDefaultAppMetadataControllerState,
  type AppMetadataControllerOptions,
  type AppMetadataControllerActions,
  type AppMetadataControllerEvents,
} from './AppMetadataController';

describe('AppMetadataController', () => {
  describe('constructor', () => {
    it('accepts initial state and does not modify it if currentMigrationVersion and platform.getVersion() match respective values in state', async () => {
      const initState = {
        currentAppVersion: '1',
        previousAppVersion: '1',
        previousMigrationVersion: 1,
        currentMigrationVersion: 1,
      };
      withController(
        {
          state: initState,
          currentMigrationVersion: 1,
          currentAppVersion: '1',
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(initState);
        },
      );
    });

    it('sets default state and does not modify it', () => {
      withController(({ controller }) => {
        expect(controller.state).toStrictEqual(
          getDefaultAppMetadataControllerState(),
        );
      });
    });

    it('sets default state and does not modify it if options version parameters match respective default values', () => {
      withController(
        {
          state: {},
          currentMigrationVersion: 0,
          currentAppVersion: '',
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(
            getDefaultAppMetadataControllerState(),
          );
        },
      );
    });

    it('updates the currentAppVersion state property if options.currentAppVersion does not match the default value', () => {
      withController(
        {
          state: {},
          currentMigrationVersion: 0,
          currentAppVersion: '1',
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            ...getDefaultAppMetadataControllerState(),
            currentAppVersion: '1',
          });
        },
      );
    });

    it('updates the currentAppVersion and previousAppVersion state properties if options.currentAppVersion, currentAppVersion and previousAppVersion are all different', () => {
      withController(
        {
          state: {
            currentAppVersion: '2',
            previousAppVersion: '1',
          },
          currentAppVersion: '3',
          currentMigrationVersion: 0,
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            ...getDefaultAppMetadataControllerState(),
            currentAppVersion: '3',
            previousAppVersion: '2',
          });
        },
      );
    });

    it('updates the currentMigrationVersion state property if the currentMigrationVersion param does not match the default value', () => {
      withController(
        {
          state: {},
          currentMigrationVersion: 1,
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            ...getDefaultAppMetadataControllerState(),
            currentMigrationVersion: 1,
          });
        },
      );
    });

    it('updates the currentMigrationVersion and previousMigrationVersion state properties if the currentMigrationVersion param, the currentMigrationVersion state property and the previousMigrationVersion state property are all different', () => {
      withController(
        {
          state: {
            currentMigrationVersion: 2,
            previousMigrationVersion: 1,
          },
          currentMigrationVersion: 3,
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            ...getDefaultAppMetadataControllerState(),
            currentMigrationVersion: 3,
            previousMigrationVersion: 2,
          });
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "currentAppVersion": "",
            "currentMigrationVersion": 0,
            "previousAppVersion": "",
            "previousMigrationVersion": 0,
          }
        `);
      });
    });

    it('includes expected state in state logs', () => {
      withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "currentAppVersion": "",
            "currentMigrationVersion": 0,
            "previousAppVersion": "",
            "previousMigrationVersion": 0,
          }
        `);
      });
    });

    it('persists expected state', () => {
      withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "currentAppVersion": "",
            "currentMigrationVersion": 0,
            "previousAppVersion": "",
            "previousMigrationVersion": 0,
          }
        `);
      });
    });

    it('exposes expected state to UI', () => {
      withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });
  });
});

type WithControllerOptions = Partial<AppMetadataControllerOptions>;

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: AppMetadataController;
}) => ReturnValue;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds an AppMetadataController based on the given options, then calls the
 * given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag accepts controller options and config; the function
 * will be called with the built controller.
 * @returns Whatever the callback returns.
 */
function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): ReturnValue {
  const [options = {}, fn] = args.length === 2 ? args : [{}, args[0]];

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AppMetadataControllerActions,
    AppMetadataControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  const appMetadataControllerMessenger = new Messenger<
    'AppMetadataController',
    AppMetadataControllerActions,
    AppMetadataControllerEvents,
    typeof rootMessenger
  >({
    namespace: 'AppMetadataController',
    parent: rootMessenger,
  });

  return fn({
    controller: new AppMetadataController({
      messenger: appMetadataControllerMessenger,
      ...options,
    }),
  });
}
