import { Messenger } from '@metamask/messenger';
import { SubjectMetadataController } from '@metamask/permission-controller';

import { defaultConfigurations } from '../../defaults';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { subjectMetadataController } from './subject-metadata-controller';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

/**
 * Registers a stub `PermissionController:hasPermissions` handler on the bus, as
 * the real `PermissionController` would. `SubjectMetadataController` calls this
 * action when hydrating from state and when trimming its cache.
 *
 * @param rootMessenger - The root messenger to register the handler on.
 * @param hasPermissions - The value the stub returns for any origin.
 */
function registerHasPermissionsStub(
  rootMessenger: RootMessenger<DefaultActions, DefaultEvents>,
  hasPermissions: boolean,
): void {
  const permissionControllerMessenger = new Messenger({
    namespace: 'PermissionController',
    parent: rootMessenger,
  });

  permissionControllerMessenger.registerActionHandler(
    'PermissionController:hasPermissions',
    () => hasPermissions,
  );
}

describe('subjectMetadataController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      subjectMetadataController,
    );
  });

  it('initializes a SubjectMetadataController with default state', () => {
    const messenger =
      subjectMetadataController.getMessenger(getRootMessenger());

    const instance = subjectMetadataController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(SubjectMetadataController);
    expect(instance.state).toStrictEqual({ subjectMetadata: {} });
  });

  it('forwards the provided state to the controller', () => {
    const rootMessenger = getRootMessenger();
    // Subjects retained on hydration only when they still hold permissions.
    registerHasPermissionsStub(rootMessenger, true);
    const messenger = subjectMetadataController.getMessenger(rootMessenger);

    const subjectMetadata = {
      'https://metamask.io': {
        origin: 'https://metamask.io',
        name: 'MetaMask',
        subjectType: null,
        extensionId: null,
        iconUrl: null,
      },
    };

    const instance = subjectMetadataController.init({
      state: { subjectMetadata },
      messenger,
      options: {},
    });

    expect(instance.state.subjectMetadata).toStrictEqual(subjectMetadata);
  });

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = subjectMetadataController.getMessenger(rootMessenger);

    subjectMetadataController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(
      rootMessenger.call('SubjectMetadataController:getState'),
    ).toStrictEqual({ subjectMetadata: {} });
  });

  it('forwards a custom subjectCacheLimit, evicting the oldest permissionless subject', () => {
    const rootMessenger = getRootMessenger();
    registerHasPermissionsStub(rootMessenger, false);
    const messenger = subjectMetadataController.getMessenger(rootMessenger);

    const instance = subjectMetadataController.init({
      state: undefined,
      messenger,
      options: { subjectCacheLimit: 1 },
    });

    instance.addSubjectMetadata({ origin: 'https://a.example' });
    instance.addSubjectMetadata({ origin: 'https://b.example' });

    // With a cache limit of 1 and neither subject holding permissions, the
    // first is evicted when the second is added.
    expect(Object.keys(instance.state.subjectMetadata)).toStrictEqual([
      'https://b.example',
    ]);
  });

  it('defaults subjectCacheLimit to 100 when omitted, retaining subjects past a small count', () => {
    const rootMessenger = getRootMessenger();
    registerHasPermissionsStub(rootMessenger, false);
    const messenger = subjectMetadataController.getMessenger(rootMessenger);

    const instance = subjectMetadataController.init({
      state: undefined,
      messenger,
      options: {},
    });

    instance.addSubjectMetadata({ origin: 'https://a.example' });
    instance.addSubjectMetadata({ origin: 'https://b.example' });

    expect(Object.keys(instance.state.subjectMetadata)).toStrictEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});
