import type { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { Duplex } from 'readable-stream';
type EngineStreamOptions = {
    engine: JsonRpcEngine;
};
/**
 * Takes a JsonRpcEngine and returns a Duplex stream wrapping it.
 *
 * @param opts - Options bag.
 * @param opts.engine - The JsonRpcEngine to wrap in a stream.
 * @returns The stream wrapping the engine.
 */
export default function createEngineStream(opts: EngineStreamOptions): Duplex;
export {};
//# sourceMappingURL=createEngineStream.d.ts.map