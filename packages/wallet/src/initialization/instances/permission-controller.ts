import { ApprovalControllerAddAndShowApprovalRequestAction } from '@metamask/approval-controller';
import {
  KeyringControllerGetKeyringsByTypeAction,
  KeyringControllerGetStateAction,
  KeyringControllerWithKeyringAction,
} from '@metamask/keyring-controller';
import { Messenger, MessengerActions } from '@metamask/messenger';
import {
  PermissionController,
  PermissionControllerMessenger,
} from '@metamask/permission-controller';
import { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
import {
  SnapControllerClearSnapStateAction,
  SnapControllerGetPermittedSnapsAction,
  SnapControllerGetSnapAction,
  SnapControllerGetSnapStateAction,
  SnapControllerHandleRequestAction,
  SnapControllerInstallSnapsAction,
  SnapControllerUpdateSnapStateAction,
  SnapInterfaceControllerCreateInterfaceAction,
  SnapInterfaceControllerDeleteInterfaceAction,
  SnapInterfaceControllerGetInterfaceAction,
  SnapInterfaceControllerSetInterfaceDisplayedAction,
} from '@metamask/snaps-controllers';

import {
  getCaveatSpecifications,
  getPermissionSpecifications,
  unrestrictedMethods,
} from '../../permissions/specifications';
import { InitializationConfiguration } from '../types';

type InitActions =
  | SnapControllerGetPermittedSnapsAction
  | SnapControllerInstallSnapsAction
  | PreferencesControllerGetStateAction
  | KeyringControllerGetStateAction
  | KeyringControllerWithKeyringAction
  | KeyringControllerGetKeyringsByTypeAction
  | SnapControllerGetSnapAction
  | SnapControllerGetSnapStateAction
  | SnapControllerClearSnapStateAction
  | SnapControllerHandleRequestAction
  | SnapControllerUpdateSnapStateAction
  | ApprovalControllerAddAndShowApprovalRequestAction
  | SnapInterfaceControllerCreateInterfaceAction
  | SnapInterfaceControllerGetInterfaceAction
  | SnapInterfaceControllerSetInterfaceDisplayedAction;

type AllowedActions =
  | MessengerActions<PermissionControllerMessenger>
  | InitActions;

type WalletPermissionControllerMessenger = Messenger<
  'PermissionController',
  AllowedActions
>;

export const permissionController: InitializationConfiguration<
  PermissionController,
  WalletPermissionControllerMessenger
> = {
  name: 'PermissionController',
  init: ({ messenger, state }) => {
    const instance = new PermissionController({
      messenger: messenger as PermissionControllerMessenger,
      state,
      permissionSpecifications: getPermissionSpecifications(messenger),
      caveatSpecifications: getCaveatSpecifications(messenger),
      unrestrictedMethods,
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const controllerMessenger: WalletPermissionControllerMessenger =
      new Messenger({
        namespace: 'PermissionController',
        parent,
      });

    parent.delegate({
      messenger: controllerMessenger,
      actions: [
        'ApprovalController:addRequest',
        'ApprovalController:hasRequest',
        'ApprovalController:acceptRequest',
        'ApprovalController:rejectRequest',
        'SubjectMetadataController:getSubjectMetadata',
        // Init/hook actions
        'PreferencesController:getState',
        'KeyringController:getState',
        'KeyringController:withKeyring',
        'KeyringController:getKeyringsByType',
        'SnapController:getSnap',
        'SnapController:getPermittedSnaps',
        'SnapController:installSnaps',
        'SnapController:getSnapState',
        'SnapController:clearSnapState',
        'SnapController:handleRequest',
        'ApprovalController:addAndShowApprovalRequest',
        'SnapController:updateSnapState',
        'SnapInterfaceController:createInterface',
        'SnapInterfaceController:getInterface',
        'SnapInterfaceController:setInterfaceDisplayed',
      ],
    });

    return controllerMessenger;
  },
};
