import {
  LoggingController,
  LoggingControllerMessenger,
} from '@metamask/logging-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types';

export const loggingController: InitializationConfiguration<
  LoggingController,
  LoggingControllerMessenger
> = {
  name: 'LoggingController',
  init: ({ state, messenger }) =>
    new LoggingController({
      state,
      messenger,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'LoggingController',
      parent,
    }),
};
