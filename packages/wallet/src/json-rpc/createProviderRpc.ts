import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { asLegacyMiddleware } from '@metamask/json-rpc-engine/v2';
import { createEngineStream } from '@metamask/json-rpc-middleware-stream';
import ObjectMultiplex from '@metamask/object-multiplex';
import {
  PermissionController,
  SubjectType,
} from '@metamask/permission-controller';
import {
  createWalletSnapPermissionMiddleware,
  createSnapsMethodMiddleware,
} from '@metamask/snaps-rpc-methods';
import { Duplex, pipeline } from 'readable-stream';

import { RootMessenger } from '../initialization';

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
  pipeline(connectionStream, mux, connectionStream, (err: Error | null) => {
    if (err && !err.message?.match('Premature close')) {
      console.error(err);
    }
  });
  return mux;
}

export function createRpcHooks(origin: string, messenger: RootMessenger) {
  return {
    clearSnapState: messenger.call.bind(
      messenger,
      'SnapController:clearSnapState',
      origin,
    ),
    getUnlockPromise: messenger.call.bind(
      messenger,
      'AppStateController:getUnlockPromise',
    ),
    getSnaps: messenger.call.bind(
      messenger,
      'SnapController:getPermittedSnaps',
      origin,
    ),
    requestPermissions: messenger.call.bind(
      messenger,
      'PermissionController:requestPermissions',
      { origin },
    ),
    getPermissions: messenger.call.bind(
      messenger,
      'PermissionController:getPermissions',
      origin,
    ),
    getSnapFile: messenger.call.bind(
      messenger,
      'SnapController:getSnapFile',
      origin,
    ),
    getSnapState: messenger.call.bind(
      messenger,
      'SnapController:getSnapState',
      origin,
    ),
    updateSnapState: messenger.call.bind(
      messenger,
      'SnapController:updateSnapState',
      origin,
    ),
    installSnaps: messenger.call.bind(
      messenger,
      'SnapController:installSnaps',
      origin,
    ),
    invokeSnap: messenger.call.bind(
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

      return Boolean(this._isClientOpen && isUnlocked);
    },
    getVersion: () => {
      return process.env.METAMASK_VERSION;
    },
    getInterfaceState: (...args) =>
      messenger.call(
        'SnapInterfaceController:getInterfaceState',
        origin,
        ...args,
      ),
    getInterfaceContext: (...args) =>
      messenger.call('SnapInterfaceController:getInterface', origin, ...args)
        .context,
    createInterface: messenger.call.bind(
      messenger,
      'SnapInterfaceController:createInterface',
      origin,
    ),
    updateInterface: messenger.call.bind(
      messenger,
      'SnapInterfaceController:updateInterface',
      origin,
    ),
    resolveInterface: messenger.call.bind(
      messenger,
      'SnapInterfaceController:resolveInterface',
      origin,
    ),
    getSnap: messenger.call.bind(messenger, 'SnapController:getSnap'),
    trackError: (error) => {
      // `captureException` imported from `@sentry/browser` does not seem to
      // work in E2E tests. This is a workaround which works in both E2E
      // tests and production.
      return global.sentry?.captureException?.(error);
    },
    /**
           trackEvent: this.metaMetricsController.trackEvent.bind(
          this.metaMetricsController,
        ),*
     */
    getAllSnaps: messenger.call.bind(messenger, 'SnapController:getAllSnaps'),
    openWebSocket: messenger.call.bind(
      messenger,
      'WebSocketService:open',
      origin,
    ),
    closeWebSocket: messenger.call.bind(
      messenger,
      'WebSocketService:close',
      origin,
    ),
    getWebSockets: messenger.call.bind(
      messenger,
      'WebSocketService:getAll',
      origin,
    ),
    sendWebSocketMessage: messenger.call.bind(
      messenger,
      'WebSocketService:sendMessage',
      origin,
    ),
    getCurrencyRate: (currency) => {
      const state = this._getMetaMaskState();
      const fiatCurrency = getRatesControllerFiatCurrency(state);
      const rate = getRatesControllerRates(state)[currency];

      if (!rate) {
        return undefined;
      }

      return {
        ...rate,
        currency: fiatCurrency,
      };
    },
    getEntropySources: () => {
      /**
       * @type {KeyringController['state']}
       */
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
    hasPermission: messenger.call.bind(
      messenger,
      'PermissionController:hasPermission',
      origin,
    ),
    scheduleBackgroundEvent: (event) =>
      messenger.call('CronjobController:schedule', {
        ...event,
        snapId: origin,
      }),
    cancelBackgroundEvent: messenger.call.bind(
      messenger,
      'CronjobController:cancel',
      origin,
    ),
    getBackgroundEvents: messenger.call.bind(
      messenger,
      'CronjobController:get',
      origin,
    ),
    getNetworkConfigurationByChainId: messenger.call.bind(
      messenger,
      'NetworkController:getNetworkConfigurationByChainId',
    ),
    getNetworkClientById: messenger.call.bind(
      messenger,
      'NetworkController:getNetworkClientById',
    ),
    startTrace: () => {},
    endTrace: () => {},
    handleSnapRpcRequest: (args) =>
      messenger.call('SnapController:handleRequest', { ...args, origin }),
    getAllowedKeyringMethods: () => [],
  };
}

export function createProviderRpc({
  origin,
  subjectType,
  messenger,
  createPermissionMiddleware,
  stream,
}: {
  origin: string;
  subjectType: SubjectType;
  messenger: RootMessenger;
  // TODO: Move to messenger.
  createPermissionMiddleware: PermissionController['createPermissionMiddleware'];
  stream: Duplex;
}) {
  const mux = setupMultiplex(stream);

  // TODO: Use V2, currently not compatible with createEngineStream.
  const engine = new JsonRpcEngine();

  // TODO: A bunch of middlewares are missing.
  // TODO: Configure additional client-specific middlewares

  engine.push(asLegacyMiddleware(createWalletSnapPermissionMiddleware()));

  engine.push(createPermissionMiddleware({ origin }));

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
