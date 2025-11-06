export {
  ClaimsController,
  getDefaultClaimsControllerState,
} from './ClaimsController';

export type {
  ClaimsControllerGetStateAction,
  ClaimsControllerActions,
  ClaimsControllerStateChangeEvent,
  ClaimsControllerMessenger,
} from './ClaimsController';

export type { Claim, ClaimsControllerState } from './types';

export { ClaimsService } from './ClaimsService';

export type {
  ClaimsServiceGetClaimsAction,
  ClaimsServiceGetRequestHeadersAction,
  ClaimsServiceGetClaimsApiUrlAction,
  ClaimsServiceGetClaimByIdAction,
  ClaimsServiceGenerateMessageForClaimSignatureAction,
  ClaimsServiceVerifyClaimSignatureAction,
  ClaimsServiceActions,
  ClaimsServiceMessenger,
} from './ClaimsService';
