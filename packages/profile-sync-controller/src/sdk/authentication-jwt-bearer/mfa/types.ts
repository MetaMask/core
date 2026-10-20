import type { Infer } from '@metamask/superstruct';

import type {
  AuthenticationResponseJSONStruct,
  MfaCredentialStruct,
  MfaCredentialsResponseStruct,
  MfaEmailDetailStruct,
  MfaEnrollCompleteResponseStruct,
  MfaEnrollResponseStruct,
  MfaPasskeyDetailStruct,
  MfaVerifyCompleteResponseStruct,
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
  typeof MfaVerifyCompleteResponseStruct
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

type EnrolledCredentialBase = {
  status: MfaCredentialStatus;
  /** Epoch milliseconds, when the server sent a valid date. */
  enrolledAt?: number;
  /** Epoch milliseconds of the last verification, when the server sent one. */
  lastUsedAt?: number;
};

export type EnrolledCredential = EnrolledCredentialBase &
  (
    | {
        type: 'passkey';
        displayName?: string;
      }
    | {
        type: 'email_otp';
        /**
         * Absent when the server lists an email method without its address;
         * the API marks the address optional.
         */
        email?: string;
        verified: boolean;
      }
    | {
        type: 'totp';
      }
  );

/**
 * Caller-supplied context attached to MFA trace spans. `operation` names the
 * client flow that needs the credential (for example `money.signTransaction`).
 */
export type TokenReason = {
  operation: string;
};

/** Fields every enrollment or verification challenge carries. */
type MfaChallengeBase = {
  /** Identifier to send back when completing the flow. */
  flowId: string;
  /** Epoch milliseconds after which the flow can no longer be completed. */
  expiresAt: number;
};

export type EnrollmentChallenge = MfaChallengeBase &
  (
    | {
        type: 'passkey';
        publicKey: PublicKeyCredentialCreationOptionsJSON;
      }
    | {
        type: 'email_otp';
      }
    | {
        type: 'totp';
        /**
         * Base32 secret for the user's authenticator app, for manual entry or
         * an `otpauth://` link. Never log or persist it.
         */
        secret: string;
        /**
         * PNG data URL of the QR code encoding the secret; render it as-is.
         * Never log or persist it.
         */
        qrCode: string;
        /**
         * `otpauth://` link that opens an authenticator app on this device
         * with the account to add, since a phone cannot scan its own screen.
         * Contains the secret: never log or persist it.
         */
        setupUri: string;
      }
  );

export type EnrollmentProof =
  | {
      type: 'passkey';
      attestation: RegistrationResponseJSON;
    }
  | {
      type: 'email_otp' | 'totp';
      code: string;
    };

export type VerificationChallenge = MfaChallengeBase &
  (
    | {
        type: 'passkey';
        publicKey: PublicKeyCredentialRequestOptionsJSON;
      }
    | {
        type: 'email_otp' | 'totp';
      }
  );

export type VerificationProof =
  | {
      type: 'passkey';
      assertion: AuthenticationResponseJSON;
    }
  | {
      type: 'email_otp' | 'totp';
      code: string;
    };

export type VerificationToken = {
  accessToken: string;
  expiresIn: number;
  obtainedAt: number;
  claims: {
    sub: string;
    /**
     * Methods the verification used. Usually an `MfaCredentialType`, but the
     * server may report other method names.
     */
    amr: (MfaCredentialType | (string & Record<never, never>))[];
    exp: number;
  };
};

export type BeginEnrollmentRequest = {
  type: MfaCredentialType;
  email?: string;
  reason: TokenReason;
  /**
   * Maximum age, in milliseconds, of a verification session that may authorize
   * this enrollment. Defaults to `ENROLLMENT_MAX_SESSION_AGE_MS`. A setup flow
   * that proved a factor itself may pass the time elapsed since it started.
   * Zero never uses the session.
   */
  maxSessionAgeMs?: number;
};

export type CompleteEnrollmentRequest = {
  flowId: string;
  proof: EnrollmentProof;
  reason: TokenReason;
};

export type BeginVerificationRequest = {
  type: MfaCredentialType;
  reason: TokenReason;
};

export type CompleteVerificationRequest = {
  flowId: string;
  proof: VerificationProof;
  reason: TokenReason;
};

export type GetVerificationTokenRequest = {
  maxSessionAgeMs?: number;
};

export type MfaErrorCode =
  | 'max_passkeys_reached'
  | 'max_identifiers_reached'
  | 'email_already_enrolled'
  | 'totp_already_enrolled'
  | 'credential_already_enrolled'
  | 'credential_not_enrolled'
  | 'email_socially_verified'
  | 'mfa_identity_missing'
  | 'multi_primary_srp'
  | 'aal2_required'
  | 'otp_resend_cooldown'
  | 'rate_limited'
  | 'kratos_unavailable'
  | 'flow_expired'
  | 'invalid_flow'
  | 'invalid_attestation'
  | 'invalid_code'
  | 'invalid_assertion'
  | 'too_many_attempts'
  | 'verification_token_invalid'
  | 'authentication_required'
  | 'server_error'
  | 'invalid_response'
  | 'invalid_request';
