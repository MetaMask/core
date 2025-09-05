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
export { walletSendCalls } from './methods/wallet-send-calls';
export { walletGetCallsStatus } from './methods/wallet-get-calls-status';
export { walletGetCapabilities } from './methods/wallet-get-capabilities';
export type { EIP5792Messenger } from './types';

export type {
  GetCallsStatusHook,
  GetCallsStatusParams,
  GetCallsStatusResult,
} from './methods/wallet-get-calls-status';
export type {
  GetCapabilitiesHook,
  GetCapabilitiesParams,
  GetCapabilitiesResult,
} from './methods/wallet-get-capabilities';
export type {
  ProcessSendCallsHook,
  SendCalls,
  SendCallsParams,
  SendCallsResult,
} from './methods/wallet-send-calls';
