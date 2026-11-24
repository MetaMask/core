export {
  decodeAggregate3Response,
  encodeAggregate3,
} from './aggregate3Codec.js';
export {
  MulticallClient,
  type MulticallClientConfig,
} from './MulticallClient.js';

// Re-export provider types from types module
export type { GetProviderFunction, Provider } from '../types/index.js';
