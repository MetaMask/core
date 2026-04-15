import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../types';
import { SnapController, SnapControllerMessenger } from '@metamask/snaps-controllers';


export const snapController: InitializationConfiguration<
  SnapController,
  SnapControllerMessenger
> = {
  name: 'SnapController',
  init: ({ messenger }) => {
    const instance = new SnapController({
      messenger,
    });

    return {
      instance,
    };
  },
  messenger: (parent) =>
    new Messenger<'SnapController', never, never, typeof parent>({
      namespace: 'SnapController',
      parent,
    }),
};
