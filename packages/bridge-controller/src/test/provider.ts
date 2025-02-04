import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';

export const createMockProvider = () => {
  const engine = new JsonRpcEngine();
  return new SafeEventEmitterProvider({ engine });
}