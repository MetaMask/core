import { Messenger } from '@metamask/messenger';
import { SnapController, SnapControllerMessenger } from '@metamask/snaps-controllers';
import SolanaWalletSnap from '@metamask/solana-wallet-snap/dist/preinstalled-snap.json';
import BitcoinWalletSnap from '@metamask/bitcoin-wallet-snap/dist/preinstalled-snap.json';
import TronWalletSnap from '@metamask/tron-wallet-snap/dist/preinstalled-snap.json';
import { InitializationConfiguration } from '../types';

export const snapController: InitializationConfiguration<
  SnapController,
  SnapControllerMessenger
> = {
  name: 'SnapController',
  init: ({ messenger, options }) => {
    const instance = new SnapController({
      messenger,
      ensureOnboardingComplete: options.ensureOnboardingComplete,
      preinstalledSnaps: [SolanaWalletSnap, BitcoinWalletSnap, TronWalletSnap],
    });

    instance.init().catch(console.error);

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const controllerMessenger: SnapControllerMessenger = new Messenger({
      namespace: 'SnapController',
      parent,
    });

    parent.delegate({
      messenger: controllerMessenger,
      events: [
        'ExecutionService:unhandledError',
        'ExecutionService:outboundRequest',
        'ExecutionService:outboundResponse',
        'KeyringController:lock',
        'SnapRegistryController:registryUpdated',
      ],
      actions: [
        'PermissionController:getEndowments',
        'PermissionController:getPermissions',
        'PermissionController:hasPermission',
        'PermissionController:hasPermissions',
        'PermissionController:revokeAllPermissions',
        'PermissionController:revokePermissions',
        'PermissionController:revokePermissionForAllSubjects',
        'PermissionController:getSubjectNames',
        'PermissionController:updateCaveat',
        'ApprovalController:addRequest',
        'ApprovalController:updateRequestState',
        'PermissionController:grantPermissions',
        'SubjectMetadataController:getSubjectMetadata',
        'SubjectMetadataController:addSubjectMetadata',
        'ExecutionService:executeSnap',
        'ExecutionService:terminateSnap',
        'ExecutionService:handleRpcRequest',
        'SnapRegistryController:get',
        'SnapRegistryController:getMetadata',
        'SnapRegistryController:requestUpdate',
        'SnapRegistryController:resolveVersion',
        'SnapInterfaceController:createInterface',
        'SnapInterfaceController:getInterface',
        'SnapInterfaceController:setInterfaceDisplayed',
        'StorageService:setItem',
        'StorageService:getItem',
        'StorageService:removeItem',
        'StorageService:clear',
      ],
    });
    return controllerMessenger;
  }
};
