import { providerAsMiddleware } from '@metamask/eth-json-rpc-middleware';
import {
  createOriginMiddleware,
  JsonRpcEngine,
} from '@metamask/json-rpc-engine';
import { createEngineStream } from '@metamask/json-rpc-middleware-stream';
import ObjectMultiplex from '@metamask/object-multiplex';
import { createPermissionMiddleware } from '@metamask/permission-controller';
import { createSelectedNetworkMiddleware } from '@metamask/selected-network-controller';
import { Duplex, pipeline } from 'readable-stream';

import {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../initialization/defaults.js';
import { createUnsupportedMethodMiddleware } from './unsupported-methods.js';

const METAMASK_EIP_1193_PROVIDER = 'metamask-provider';
const METAMASK_CAIP_MULTICHAIN_PROVIDER = 'metamask-multichain-provider';

export type ConnectProviderRpcOptions = {
  messenger: RootMessenger<DefaultActions, DefaultEvents>;
  origin: string;
  stream: Duplex;
};

export function connectProviderRpc(options: ConnectProviderRpcOptions) {
  const { stream } = options;
  const { engine, destroy } = createJsonRpcEngine(options);
  const providerStream = createEngineStream({ engine });
  const mux = setupMultiplex(stream);

  // TODO: Refactor to support CAIP stream/engine
  const outStream = mux.createStream(METAMASK_EIP_1193_PROVIDER);

  pipeline(
    outStream,
    // dupeReqFilterStream,
    providerStream,
    outStream,
    (error) => {
      destroy();
      if (error && !error.message?.match('Premature close')) {
        console.error(error);
      }
    },
  );
}

/**
 * Sets up stream multiplexing for the given stream.
 *
 * @param connectionStream - The stream to mux.
 * @returns The multiplexed stream.
 */
export function setupMultiplex(connectionStream: Duplex): ObjectMultiplex {
  const mux = new ObjectMultiplex();
  pipeline(connectionStream, mux, connectionStream, (error) => {
    if (error && !error.message?.match('Premature close')) {
      console.error(error);
    }
  });
  return mux;
}

export type CreateJsonRpcEngineOptions = Pick<
  ConnectProviderRpcOptions,
  'messenger' | 'origin'
>;

function createJsonRpcEngine({
  messenger,
  origin,
}: CreateJsonRpcEngineOptions) {
  // TODO: Use v2.
  const engine = new JsonRpcEngine();

  engine.push(createOriginMiddleware(origin));

  engine.push(createSelectedNetworkMiddleware(messenger));

  // Inject pre-permissions here.

  engine.push(createUnsupportedMethodMiddleware());

  // In extension this is gated with a SubjectType check, verify if still used.
  engine.push(createPermissionMiddleware({ messenger, origin }));

  // Inject post-permissions here.

  const proxyClient = messenger.call(
    'SelectedNetworkController:getProviderAndBlockTracker',
    origin,
  );

  // TODO: Filter and subscription middlewares
  engine.push(providerAsMiddleware(proxyClient.provider));

  const destroy = () => {
    engine.destroy();
  };

  return { engine, destroy };
}
