import type { Duplex } from 'readable-stream';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error pipeline() isn't defined as part of @types/readable-stream
import { pipeline } from 'readable-stream';

import { CaipToMultiplexTransform } from './streams/CaipToMultiplexTransform';
import { MultiplexToCaipTransform } from './streams/MultiplexToCaipTransform';
import { SplitStream } from './streams/SplitStream';

/**
 * Creates a pipeline using a port stream meant to be consumed by the JSON-RPC engine:
 * - accepts only incoming CAIP messages intended for evm providers from the port stream
 * - translates those incoming messages into the internal multiplexed format for 'metamask-provider'
 * - writes these messages to a new stream that the JSON-RPC engine should operate off
 * - accepts only outgoing messages in the internal multiplexed format for 'metamask-provider' from this new stream
 * - translates those outgoing messages back to the CAIP message format
 * - writes these messages back to the port stream
 *
 * @param portStream - The source and sink duplex stream
 * @param logger - An optional function called when the internal pipeline ends
 * @returns a new duplex stream that should be operated on instead of the original portStream
 */
export const createCaipStream = (
  portStream: Duplex,
  logger: (...data: unknown[]) => void = console.log,
): Duplex => {
  const splitStream = new SplitStream();
  const caipToMultiplexTransform = new CaipToMultiplexTransform();
  const multiplexToCaipTransform = new MultiplexToCaipTransform();

  pipeline(
    portStream,
    caipToMultiplexTransform,
    splitStream,
    multiplexToCaipTransform,
    portStream,
    (err: Error) => logger('MetaMask CAIP stream', err),
  );

  return splitStream.substream;
};
