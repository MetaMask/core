import { Messenger } from '@metamask/messenger';
import {
  SubjectMetadataController,
  SubjectMetadataControllerMessenger,
} from '@metamask/permission-controller';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import type { InitializationConfiguration } from '../../types';

/**
 * Default maximum number of distinct permissionless subjects to cache metadata
 * for before the oldest is evicted. `100` matches the value MetaMask clients
 * currently use; clients can override via
 * `instanceOptions.subjectMetadataController.subjectCacheLimit`.
 */
const DEFAULT_SUBJECT_CACHE_LIMIT = 100;

export const subjectMetadataController: InitializationConfiguration<
  SubjectMetadataController,
  SubjectMetadataControllerMessenger
> = {
  name: 'SubjectMetadataController',
  init: ({ state, messenger, options }) =>
    new SubjectMetadataController({
      state,
      messenger,
      subjectCacheLimit:
        options.subjectCacheLimit ?? DEFAULT_SUBJECT_CACHE_LIMIT,
    }),
  getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) => {
    const subjectMetadataControllerMessenger: SubjectMetadataControllerMessenger =
      new Messenger({
        namespace: 'SubjectMetadataController',
        parent,
      });

    // Hydration calls `PermissionController:hasPermissions`, so
    // `PermissionController` must be constructed first. It sorts earlier in
    // `instances/index.ts`, and `initialize` keeps that order under overrides.
    parent.delegate({
      messenger: subjectMetadataControllerMessenger,
      actions: ['PermissionController:hasPermissions'],
    });

    return subjectMetadataControllerMessenger;
  },
};
