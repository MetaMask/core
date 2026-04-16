import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { createEngineStream } from '@metamask/json-rpc-middleware-stream';
import ObjectMultiplex from '@metamask/object-multiplex';
import { Duplex, pipeline } from 'readable-stream';

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

export function createProviderRpc(stream: Duplex) {
  const mux = setupMultiplex(stream);

  // TODO: Use V2, currently not compatible with createEngineStream.
  const engine = new JsonRpcEngine();

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
