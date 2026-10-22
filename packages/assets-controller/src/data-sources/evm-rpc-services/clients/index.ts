export {
  decodeAggregate3Response,
  encodeAggregate3,
  MulticallClient,
  type MulticallClientConfig,
  type Aggregate3Codec,
} from './MulticallClient.js';
export {
  getAggregate3Codec,
  getActiveAggregate3Codec,
  setAggregate3CodecVariant,
  type Aggregate3CodecVariant,
} from './aggregate3Codecs.js';

// Re-export provider types from types module
export type { GetProviderFunction, Provider } from '../types/index.js';
