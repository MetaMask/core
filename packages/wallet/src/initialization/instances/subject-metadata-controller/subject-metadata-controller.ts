import { Messenger } from '@metamask/messenger';
import {
  SubjectMetadataController,
  SubjectMetadataControllerMessenger,
} from '@metamask/permission-controller';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import type { InitializationConfiguration } from '../../types.js';

// `100` matches the value both the extension and mobile use.
const DEFAULT_SUBJECT_CACHE_LIMIT = 100;

export const subjectMetadataController: InitializationConfiguration<
  SubjectMetadataController,
  SubjectMetadataControllerMessenger
> = {
  name: 'SubjectMetadataController',
  // Hydrating persisted metadata calls `PermissionController:hasPermissions`;
  // see the ordering note in `instances/index.ts`.
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

    parent.delegate({
      messenger: subjectMetadataControllerMessenger,
      actions: ['PermissionController:hasPermissions'],
    });

    return subjectMetadataControllerMessenger;
  },
};
