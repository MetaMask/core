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

export type { Claim, ClaimsControllerState, Attachment } from './types';

export { ClaimsService } from './ClaimsService';

export type {
  ClaimsServiceGetClaimsAction,
  ClaimsServiceGetRequestHeadersAction,
  ClaimsServiceGetClaimsApiUrlAction,
  ClaimsServiceGetClaimByIdAction,
  ClaimsServiceGenerateMessageForClaimSignatureAction,
  ClaimsServiceActions,
  ClaimsServiceMessenger,
} from './ClaimsService';

export {
  ClaimStatusEnum,
  Env,
  ClaimsControllerErrorMessages,
} from './constants';
