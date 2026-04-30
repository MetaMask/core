import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import {
  asLegacyMiddleware,
  createOriginMiddleware,
} from '@metamask/json-rpc-engine/v2';
import { createEngineStream } from '@metamask/json-rpc-middleware-stream';
import { KeyringTypes } from '@metamask/keyring-controller';
import ObjectMultiplex from '@metamask/object-multiplex';
import {
  SubjectType,
  createPermissionMiddleware,
} from '@metamask/permission-controller';
import { CronjobControllerScheduleAction } from '@metamask/snaps-controllers';
import {
  createWalletSnapPermissionMiddleware,
  createSnapsMethodMiddleware,
} from '@metamask/snaps-rpc-methods';
import { SnapId } from '@metamask/snaps-sdk';
import { SnapRpcHookArgs } from '@metamask/snaps-utils';
import { Duplex, pipeline } from 'readable-stream';

import {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../initialization';
import { bindMessengerAction } from '../initialization/types';

const METAMASK_EIP_1193_PROVIDER = 'metamask-provider';
const METAMASK_CAIP_MULTICHAIN_PROVIDER = 'metamask-multichain-provider';

/**
 * Sets up stream multiplexing for the given stream
 *
 * @param connectionStream - the stream to mux
 * @returns the multiplexed stream
 */
export function setupMultiplex(connectionStream: Duplex): ObjectMultiplex {
  const mux = new ObjectMultiplex();
  pipeline(connectionStream, mux, connectionStream, (error: Error | null) => {
    if (error && !error.message?.match('Premature close')) {
      console.error(error);
    }
  });
  return mux;
}

export function createRpcHooks(
  origin: string,
  messenger: RootMessenger<DefaultActions, DefaultEvents>,
): Record<string, unknown> {
  return {
    clearSnapState: bindMessengerAction(
      messenger,
      'SnapController:clearSnapState',
      origin,
    ),
    getUnlockPromise: async () => {
      if (messenger.call('KeyringController:getState').isUnlocked) {
        return Promise.resolve();
      }

      return messenger.waitUntil('KeyringController:unlock');
    },
    getSnaps: bindMessengerAction(
      messenger,
      'SnapController:getPermittedSnaps',
      origin,
    ),
    requestPermissions: bindMessengerAction(
      messenger,
      'PermissionController:requestPermissions',
      { origin },
    ),
    getPermissions: bindMessengerAction(
      messenger,
      'PermissionController:getPermissions',
      origin,
    ),
    getSnapFile: bindMessengerAction(
      messenger,
      'SnapController:getSnapFile',
      origin,
    ),
    getSnapState: bindMessengerAction(
      messenger,
      'SnapController:getSnapState',
      origin,
    ),
    updateSnapState: bindMessengerAction(
      messenger,
      'SnapController:updateSnapState',
      origin,
    ),
    installSnaps: bindMessengerAction(
      messenger,
      'SnapController:installSnaps',
      origin,
    ),
    invokeSnap: bindMessengerAction(
      messenger,
      'PermissionController:executeRestrictedMethod',
      origin,
      'wallet_snap',
    ),
    getIsLocked: () => {
      const { isUnlocked } = messenger.call('KeyringController:getState');

      return !isUnlocked;
    },
    getIsActive: () => {
      const { isUnlocked } = messenger.call('KeyringController:getState');
      // TODO: This is different between clients.
      return Boolean(isUnlocked);
    },
    getVersion: () => {
      return process.env.METAMASK_VERSION;
    },
    getInterfaceState: bindMessengerAction(
      messenger,
      'SnapInterfaceController:getInterfaceState',
      origin,
    ),
    getInterfaceContext: (id: string) =>
      messenger.call(
        'SnapInterfaceController:getInterface',
        origin as SnapId,
        id,
      ).context,
    createInterface: bindMessengerAction(
      messenger,
      'SnapInterfaceController:createInterface',
      origin,
    ),
    updateInterface: bindMessengerAction(
      messenger,
      'SnapInterfaceController:updateInterface',
      origin,
    ),
    resolveInterface: bindMessengerAction(
      messenger,
      'SnapInterfaceController:resolveInterface',
      origin,
    ),
    getSnap: bindMessengerAction(messenger, 'SnapController:getSnap'),
    getAllSnaps: bindMessengerAction(messenger, 'SnapController:getAllSnaps'),
    getEntropySources: () => {
      const state = messenger.call('KeyringController:getState');

      return state.keyrings
        .map((keyring, index) => {
          if (keyring.type === KeyringTypes.hd) {
            return {
              id: keyring.metadata.id,
              name: keyring.metadata.name,
              type: 'mnemonic',
              primary: index === 0,
            };
          }

          return null;
        })
        .filter(Boolean);
    },
    hasPermission: bindMessengerAction(
      messenger,
      'PermissionController:hasPermission',
      origin,
    ),
    scheduleBackgroundEvent: (
      event: Parameters<CronjobControllerScheduleAction['handler']>[0],
    ) =>
      messenger.call('CronjobController:schedule', {
        ...event,
        snapId: origin as SnapId,
      }),
    cancelBackgroundEvent: bindMessengerAction(
      messenger,
      'CronjobController:cancel',
      origin,
    ),
    getBackgroundEvents: bindMessengerAction(
      messenger,
      'CronjobController:get',
      origin,
    ),
    getNetworkConfigurationByChainId: bindMessengerAction(
      messenger,
      'NetworkController:getNetworkConfigurationByChainId',
    ),
    getNetworkClientById: bindMessengerAction(
      messenger,
      'NetworkController:getNetworkClientById',
    ),
    startTrace: () => {
      return null;
    },
    endTrace: () => {
      return null;
    },
    handleSnapRpcRequest: (
      request: Omit<SnapRpcHookArgs, 'origin'> & { snapId: SnapId },
    ) =>
      messenger.call('SnapController:handleRequest', {
        snapId: request.snapId,
        origin,
        handler: request.handler,
        request: request.request,
      }),
    getAllowedKeyringMethods: () => [],
  };
}

export function createProviderRpc({
  origin,
  subjectType,
  messenger,
  stream,
}: {
  origin: string;
  subjectType: SubjectType;
  messenger: RootMessenger<DefaultActions, DefaultEvents>;
  stream: Duplex;
}) {
  const mux = setupMultiplex(stream);

  // TODO: Use V2, currently not compatible with createEngineStream.
  const engine = new JsonRpcEngine();

  // @ts-expect-error This middleware has type issues when used as a legacy middleware.
  engine.push(asLegacyMiddleware(createOriginMiddleware(origin)));

  // TODO: A bunch of middlewares are missing.
  // TODO: Configure additional client-specific middlewares

  // @ts-expect-error This middleware has type issues when used as a legacy middleware.
  engine.push(asLegacyMiddleware(createWalletSnapPermissionMiddleware()));

  engine.push(createPermissionMiddleware({ messenger, origin }));

  const hooks = createRpcHooks(origin, messenger);

  engine.push(
    createSnapsMethodMiddleware(subjectType === SubjectType.Snap, hooks),
  );

  // TODO: CAIP provider
  const providerStream = mux.createStream(METAMASK_EIP_1193_PROVIDER);

  const engineStream = createEngineStream({ engine });

  pipeline(providerStream, engineStream, providerStream, (error) => {
    engine.destroy();
    if (error && !error.message?.match('Premature close')) {
      console.error(error);
    }
  });

  return { engine };
}
