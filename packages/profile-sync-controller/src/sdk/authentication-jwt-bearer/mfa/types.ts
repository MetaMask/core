import type { Infer } from '@metamask/superstruct';

import type {
  AuthenticationResponseJSONStruct,
  AuthenticationResponseStruct,
  MfaCredentialStruct,
  MfaCredentialsResponseStruct,
  MfaEmailDetailStruct,
  MfaEnrollCompleteResponseStruct,
  MfaEnrollResponseStruct,
  MfaPasskeyDetailStruct,
  MfaVerifyResponseStruct,
  PublicKeyCredentialCreationOptionsJSONStruct,
  PublicKeyCredentialRequestOptionsJSONStruct,
  RegistrationResponseJSONStruct,
} from './schemas.js';
import { MFA_CREDENTIAL_TYPES } from './schemas.js';

export { MFA_CREDENTIAL_TYPES };

export type MfaCredentialType = (typeof MFA_CREDENTIAL_TYPES)[number];

export type MfaCredentialStatus = 'active' | 'pending';

export type PublicKeyCredentialCreationOptionsJSON = Infer<
  typeof PublicKeyCredentialCreationOptionsJSONStruct
>;

export type PublicKeyCredentialRequestOptionsJSON = Infer<
  typeof PublicKeyCredentialRequestOptionsJSONStruct
>;

export type RegistrationResponseJSON = Infer<
  typeof RegistrationResponseJSONStruct
>;

export type AuthenticationResponseJSON = Infer<
  typeof AuthenticationResponseJSONStruct
>;

export type MfaEnrollResponse = Infer<typeof MfaEnrollResponseStruct>;

export type MfaEnrollCompleteResponse = Infer<
  typeof MfaEnrollCompleteResponseStruct
>;

export type MfaVerifyResponse = Infer<typeof MfaVerifyResponseStruct>;

export type MfaVerifyCompleteResponse = Infer<
  typeof AuthenticationResponseStruct
>;

export type MfaCredentialsResponse = Infer<typeof MfaCredentialsResponseStruct>;

export type MfaCredential = Infer<typeof MfaCredentialStruct>;

export type MfaPasskeyDetail = Infer<typeof MfaPasskeyDetailStruct>;

export type MfaEmailDetail = Infer<typeof MfaEmailDetailStruct>;

export type MfaEnrollRequest = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  credential_type: MfaCredentialType;
  identifier?: string;
};

export type MfaEnrollCompleteRequest = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  credential_type: MfaCredentialType;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  flow_id: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  otp_code?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  passkey_attestation?: string;
};

export type MfaVerifyRequest = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  credential_type: MfaCredentialType;
};

export type MfaVerifyCompleteRequest = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  credential_type: MfaCredentialType;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  flow_id: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  passkey_assertion?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  otp_code?: string;
};

export type EnrolledCredential =
  | {
      type: 'passkey';
      status: MfaCredentialStatus;
      enrolledAt?: number;
      displayName?: string;
    }
  | {
      type: 'email_otp';
      status: MfaCredentialStatus;
      enrolledAt?: number;
      email: string;
      verified: boolean;
    };

export type TokenReason = {
  operation: string;
  description?: string;
};

export type EnrollmentChallenge =
  | {
      type: 'passkey';
      flowId: string;
      expiresAt: number;
      publicKey: PublicKeyCredentialCreationOptionsJSON;
    }
  | {
      type: 'email_otp';
      flowId: string;
      expiresAt: number;
      emailSent: true;
    };

export type EnrollmentProof =
  | {
      type: 'passkey';
      attestation: RegistrationResponseJSON;
    }
  | {
      type: 'email_otp';
      code: string;
    };

export type StepUpChallenge =
  | {
      type: 'passkey';
      flowId: string;
      expiresAt: number;
      publicKey: PublicKeyCredentialRequestOptionsJSON;
    }
  | {
      type: 'email_otp';
      flowId: string;
      expiresAt: number;
      deliverySent: true;
    };

export type StepUpProof =
  | {
      type: 'passkey';
      assertion: AuthenticationResponseJSON;
    }
  | {
      type: 'email_otp';
      code: string;
    };

export type ElevatedProfileToken = {
  accessToken: string;
  expiresIn: number;
  obtainedAt: number;
  claims: {
    sub: string;
    aal: 2;
    amr: MfaCredentialType[];
    exp: number;
  };
};

export type BeginEnrollmentRequest = {
  type: MfaCredentialType;
  email?: string;
  reason: TokenReason;
};

export type CompleteEnrollmentRequest = {
  type: MfaCredentialType;
  flowId: string;
  proof: EnrollmentProof;
};

export type BeginStepUpRequest = {
  credentialType: MfaCredentialType;
  reason: TokenReason;
};

export type CompleteStepUpRequest = {
  credentialType: MfaCredentialType;
  flowId: string;
  proof: StepUpProof;
};

export type GetElevatedTokenRequest = {
  maxSessionAgeMs?: number;
};

export type MfaErrorCode =
  | 'max_passkeys_reached'
  | 'max_identifiers_reached'
  | 'email_already_enrolled'
  | 'credential_already_enrolled'
  | 'credential_not_enrolled'
  | 'mfa_identity_missing'
  | 'otp_resend_cooldown'
  | 'kratos_unavailable'
  | 'flow_expired'
  | 'invalid_flow'
  | 'invalid_attestation'
  | 'invalid_code'
  | 'invalid_assertion'
  | 'too_many_attempts'
  | 'elevated_token_invalid'
  | 'authentication_required'
  | 'server_error'
  | 'invalid_response'
  | 'invalid_request';
