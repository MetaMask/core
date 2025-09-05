export type {
  ProcessSendCallsRequest,
  ProcessSendCallsHooks,
} from './hooks/processSendCalls';
export { processSendCalls } from './hooks/processSendCalls';
export { getCallsStatus } from './hooks/getCallsStatus';
export {
  getCapabilities,
  type GetCapabilitiesHooks,
} from './hooks/getCapabilities';
export { walletSendCalls } from './methods/wallet_sendCalls';
export { walletGetCallsStatus } from './methods/wallet_getCallsStatus';
export { walletGetCapabilities } from './methods/wallet_getCapabilities';
export type { EIP5792Messenger } from './types';

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
} from './types';
