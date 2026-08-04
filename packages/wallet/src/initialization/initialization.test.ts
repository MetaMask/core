import { Messenger } from '@metamask/messenger';
import { InMemoryStorageAdapter } from '@metamask/storage-service';

import type { InstanceSpecificOptions } from '../types.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './defaults.js';
import { defaultConfigurations } from './defaults.js';
import { initialize } from './initialization.js';
import { AlwaysOnlineAdapter } from './instances/connectivity-controller/always-online-adapter.js';
import type { InitializationConfiguration } from './types.js';

type StubInstance = { state: Record<string, boolean> };

/**
 * The names of every default configuration, in the order `initialize` builds
 * them.
 *
 * @returns The default configuration names.
 */
function getDefaultNames(): string[] {
  return Object.values(defaultConfigurations).map((config) => config.name);
}

/**
 * Creates a stand-in configuration that records when it is constructed, so a
 * test can assert construction order without building real controllers.
 *
 * @param name - The instance name.
 * @param constructionOrder - An array each `init` call appends its name to.
 * @returns A configuration usable as an override or an addition.
 */
function createStubConfiguration(
  name: string,
  constructionOrder: string[],
): InitializationConfiguration<unknown, unknown> {
  return {
    name,
    getMessenger: (): Messenger<string> => new Messenger({ namespace: name }),
    init: (): StubInstance => {
      constructionOrder.push(name);
      return { state: {} };
    },
  };
}

/**
 * Builds the required instance options. Every test here overrides all defaults
 * with stubs, so these values are never read; they exist to satisfy the type.
 *
 * @returns The instance options.
 */
function getInstanceOptions(): InstanceSpecificOptions {
  return {
    connectivityController: {
      connectivityAdapter: new AlwaysOnlineAdapter(),
    },
    gasFeeController: { clientId: 'test' },
    networkController: { infuraProjectId: 'fake-infura-project-id' },
    storageService: { storage: new InMemoryStorageAdapter() },
    remoteFeatureFlagController: {
      clientConfigApiService: {
        fetchRemoteFeatureFlags: async () => ({
          remoteFeatureFlags: {},
          cacheTimestamp: 0,
        }),
      },
    },
  };
}

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('initialize', () => {
  describe('default construction order', () => {
    it('exports `PermissionController` before `SubjectMetadataController`', () => {
      // Pins the export order of `instances/index.ts`, which the hydration
      // dependency relies on and which no lint rule enforces.
      const names = getDefaultNames();

      expect(names.indexOf('PermissionController')).toBeLessThan(
        names.indexOf('SubjectMetadataController'),
      );
    });
  });

  describe('overriding configurations', () => {
    it('initializes an override in its default position, not in the caller-supplied order', () => {
      const constructionOrder: string[] = [];
      const defaultNames = getDefaultNames();
      // Reversed, so caller order and default order cannot coincide.
      const overrides = [...defaultNames]
        .reverse()
        .map((name) => createStubConfiguration(name, constructionOrder));

      initialize({
        messenger: getRootMessenger(),
        initializationConfigurations: overrides,
        instanceOptions: getInstanceOptions(),
      });

      expect(constructionOrder).toStrictEqual(defaultNames);
    });

    it('keeps `PermissionController` before `SubjectMetadataController` when both are overridden in reverse', () => {
      const constructionOrder: string[] = [];
      const overrides = [
        createStubConfiguration('SubjectMetadataController', constructionOrder),
        createStubConfiguration('PermissionController', constructionOrder),
      ];

      initialize({
        messenger: getRootMessenger(),
        initializationConfigurations: [
          ...getDefaultNames()
            .filter(
              (name) =>
                name !== 'PermissionController' &&
                name !== 'SubjectMetadataController',
            )
            .map((name) => createStubConfiguration(name, constructionOrder)),
          ...overrides,
        ],
        instanceOptions: getInstanceOptions(),
      });

      expect(constructionOrder.indexOf('PermissionController')).toBeLessThan(
        constructionOrder.indexOf('SubjectMetadataController'),
      );
    });

    it('replaces the default instance with the override', () => {
      const overridden = { state: { overridden: true } };

      const instances = initialize({
        messenger: getRootMessenger(),
        initializationConfigurations: getDefaultNames().map((name) => ({
          name,
          getMessenger: (): Messenger<string> =>
            new Messenger({ namespace: name }),
          init: (): StubInstance => overridden,
        })),
        instanceOptions: getInstanceOptions(),
      });

      expect(instances.PermissionController).toBe(overridden);
    });
  });

  describe('additional configurations', () => {
    it('initializes configurations that do not override a default before the defaults', () => {
      const constructionOrder: string[] = [];

      initialize({
        messenger: getRootMessenger(),
        initializationConfigurations: [
          ...getDefaultNames().map((name) =>
            createStubConfiguration(name, constructionOrder),
          ),
          createStubConfiguration('TestService', constructionOrder),
        ],
        instanceOptions: getInstanceOptions(),
      });

      expect(constructionOrder[0]).toBe('TestService');
    });
  });

  describe('duplicate names', () => {
    it('throws when two configurations share a name', () => {
      const constructionOrder: string[] = [];

      expect(() =>
        initialize({
          messenger: getRootMessenger(),
          initializationConfigurations: [
            createStubConfiguration('PermissionController', constructionOrder),
            createStubConfiguration('PermissionController', constructionOrder),
          ],
          instanceOptions: getInstanceOptions(),
        }),
      ).toThrow(
        'Duplicate initialization configuration name: PermissionController',
      );
    });

    it('throws before constructing anything', () => {
      const constructionOrder: string[] = [];

      expect(() =>
        initialize({
          messenger: getRootMessenger(),
          initializationConfigurations: [
            createStubConfiguration('TestService', constructionOrder),
            createStubConfiguration('TestService', constructionOrder),
          ],
          instanceOptions: getInstanceOptions(),
        }),
      ).toThrow('Duplicate initialization configuration name: TestService');

      expect(constructionOrder).toStrictEqual([]);
    });
  });
});
