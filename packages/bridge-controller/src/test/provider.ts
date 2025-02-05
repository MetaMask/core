import { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';

export const createMockProvider = () => {
  const engine = new JsonRpcEngine();
  return new SafeEventEmitterProvider({ engine });
};
