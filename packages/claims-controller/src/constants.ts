import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';

export const CONTROLLER_NAME = 'ClaimsController';

export const SERVICE_NAME = 'ClaimsService';

export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

export enum ClaimStatusEnum {
  // created but not yet submitted to Intercom
  CREATED = 'created',
  // submitted to Intercom
  SUBMITTED = 'submitted',
  // in progress by Intercom
  IN_PROGRESS = 'in_progress',
  // waiting for customer reply
  WAITING_FOR_CUSTOMER = 'waiting_for_customer',
  // approved by Intercom
  APPROVED = 'approved',
  // rejected by Intercom
  REJECTED = 'rejected',
  // unknown status
  UNKNOWN = 'unknown',
}

export const CLAIMS_API_URL_MAP: Record<Env, string> = {
  [Env.DEV]: 'https://claims.dev-api.cx.metamask.io',
  [Env.UAT]: 'https://claims.uat-api.cx.metamask.io',
  [Env.PRD]: 'https://claims.api.cx.metamask.io',
};

export const ClaimsControllerErrorMessages = {
  CLAIM_ALREADY_SUBMITTED: 'Claim already submitted',
  INVALID_CLAIM_SIGNATURE: 'Invalid claim signature',
  INVALID_SIGNATURE_MESSAGE: 'Invalid signature message',
};

export const ClaimsServiceErrorMessages = {
  FAILED_TO_FETCH_CONFIGURATIONS: 'Failed to fetch claims configurations',
  FAILED_TO_GET_CLAIMS: 'Failed to get claims',
  FAILED_TO_GET_CLAIM_BY_ID: 'Failed to get claim by id',
  SIGNATURE_MESSAGE_GENERATION_FAILED:
    'Failed to generate message for claim signature',
  CLAIM_SIGNATURE_VERIFICATION_REQUEST_FAILED:
    'Failed to verify claim signature',
};

/**
 * Default claims configurations.
 */
export const DEFAULT_CLAIMS_CONFIGURATIONS = {
  validSubmissionWindowDays: 21,
  supportedNetworks: [
    ChainId[BuiltInNetworkName.Mainnet],
    ChainId[BuiltInNetworkName.LineaMainnet],
  ],
};
