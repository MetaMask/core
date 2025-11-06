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

export type { Claim, ClaimsControllerState, SubmitClaimConfig } from './types';

export { ClaimsService } from './ClaimsService';

export type {
  ClaimsServiceGetClaimsAction,
  ClaimsServiceGetRequestHeadersAction,
  ClaimsServiceGetClaimsApiUrlAction,
  ClaimsServiceGetClaimByIdAction,
  ClaimsServiceActions,
  ClaimsServiceMessenger,
} from './ClaimsService';
