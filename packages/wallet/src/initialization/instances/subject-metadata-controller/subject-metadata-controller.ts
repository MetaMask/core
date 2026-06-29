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
 * Maximum number of distinct permissionless subjects to cache metadata for
 * before the oldest is evicted. Both the extension and mobile clients use
 * `100`; clients can override via
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

    parent.delegate({
      messenger: subjectMetadataControllerMessenger,
      actions: ['PermissionController:hasPermissions'],
    });

    return subjectMetadataControllerMessenger;
  },
};
