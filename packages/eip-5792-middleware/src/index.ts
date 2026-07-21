export type {
  ProcessSendCallsRequest,
  ProcessSendCallsHooks,
} from './hooks/processSendCalls.js';
export { processSendCalls } from './hooks/processSendCalls.js';
export { getCallsStatus } from './hooks/getCallsStatus.js';
export {
  getCapabilities,
  type GetCapabilitiesHooks,
} from './hooks/getCapabilities.js';
export { walletSendCalls } from './methods/wallet_sendCalls.js';
export { walletGetCallsStatus } from './methods/wallet_getCallsStatus.js';
export { walletGetCapabilities } from './methods/wallet_getCapabilities.js';
export type { EIP5792Messenger } from './types.js';

export type {
  GetCallsStatusHook,
  GetCallsStatusParams,
  GetCallsStatusResult,
  GetCapabilitiesHook,
  GetCapabilitiesParams,
  GetCapabilitiesResult,
  ProcessSendCallsHook,
  SendCallsPayload as SendCalls,
  SendCallsParams,
  SendCallsResult,
} from './types.js';
