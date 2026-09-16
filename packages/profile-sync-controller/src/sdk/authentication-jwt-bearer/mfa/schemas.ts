import {
  array,
  assert,
  boolean,
  enums,
  integer,
  literal,
  min,
  nullable,
  object,
  optional,
  pattern,
  refine,
  size,
  string,
  StructError,
  type,
  union,
} from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';

import { ElevatedTokenInvalidError, MfaError } from '../../errors.js';

export const MFA_CREDENTIAL_TYPES = ['passkey', 'email_otp'] as const;

export const MfaCredentialTypeStruct = enums(MFA_CREDENTIAL_TYPES);

const CredentialDescriptorStruct = type({
  type: literal('public-key'),
  id: string(),
  transports: optional(array(string())),
});

const ExtensionsStruct = type({});

export const PublicKeyCredentialCreationOptionsJSONStruct = type({
  rp: type({
    id: string(),
    name: string(),
  }),
  user: type({
    id: string(),
    name: string(),
    displayName: string(),
  }),
  challenge: string(),
  pubKeyCredParams: array(
    type({
      type: literal('public-key'),
      alg: integer(),
    }),
  ),
  excludeCredentials: optional(array(CredentialDescriptorStruct)),
  authenticatorSelection: optional(
    type({
      authenticatorAttachment: optional(string()),
      residentKey: optional(string()),
      requireResidentKey: optional(boolean()),
      userVerification: optional(string()),
    }),
  ),
  attestation: optional(string()),
  timeout: optional(integer()),
  extensions: optional(ExtensionsStruct),
});

export const PublicKeyCredentialRequestOptionsJSONStruct = type({
  challenge: string(),
  rpId: optional(string()),
  allowCredentials: optional(array(CredentialDescriptorStruct)),
  userVerification: optional(string()),
  timeout: optional(integer()),
  extensions: optional(ExtensionsStruct),
});

export const PasskeyCreateDataStruct = type({
  publicKey: PublicKeyCredentialCreationOptionsJSONStruct,
});

export const PasskeyRequestDataStruct = type({
  publicKey: PublicKeyCredentialRequestOptionsJSONStruct,
});

export const RegistrationResponseJSONStruct = type({
  id: string(),
  rawId: string(),
  type: literal('public-key'),
  response: type({
    attestationObject: string(),
    clientDataJSON: string(),
    transports: optional(array(string())),
    publicKeyAlgorithm: optional(integer()),
    publicKey: optional(string()),
    authenticatorData: optional(string()),
  }),
  authenticatorAttachment: optional(nullable(string())),
  clientExtensionResults: optional(ExtensionsStruct),
});

export const AuthenticationResponseJSONStruct = type({
  id: string(),
  rawId: string(),
  type: literal('public-key'),
  response: type({
    authenticatorData: string(),
    clientDataJSON: string(),
    signature: string(),
    userHandle: optional(nullable(string())),
  }),
  authenticatorAttachment: optional(nullable(string())),
  clientExtensionResults: optional(ExtensionsStruct),
});

const ProfileStruct = type({
  profile_id: string(),

  identifier_id: string(),

  identifier_type: string(),

  metametrics_id: optional(string()),
});

const ProfileAliasStruct = type({
  alias_profile_id: string(),

  canonical_profile_id: string(),

  identifier_ids: optional(
    array(
      type({
        id: string(),
        type: string(),
      }),
    ),
  ),
});

export const AuthenticationResponseStruct = type({
  token: string(),

  expires_in: integer(),
  profile: ProfileStruct,

  profile_aliases: optional(array(ProfileAliasStruct)),
});

export const MfaEnrollResponseStruct = type({
  flow_id: string(),

  expires_at: string(),

  passkey_create_data: optional(string()),
});

export const MfaEnrollCompleteResponseStruct = type({
  status: literal('enrolled'),
});

export const MfaVerifyResponseStruct = type({
  flow_id: string(),

  expires_at: string(),

  passkey_request_data: optional(string()),
});

export const MfaPasskeyDetailStruct = type({
  display_name: optional(string()),

  added_at: optional(string()),
});

export const MfaEmailDetailStruct = type({
  address: optional(string()),
  verified: optional(boolean()),
});

export const MfaCredentialStruct = type({
  // Intentionally accepts strings so future server credential types can be
  // ignored without making the complete response invalid.

  credential_type: string(),
  status: enums(['active', 'pending']),

  enrolled_at: optional(string()),
  passkey: optional(MfaPasskeyDetailStruct),
  email: optional(MfaEmailDetailStruct),
});

export const MfaCredentialsResponseStruct = type({
  credentials: array(MfaCredentialStruct),
});

export const MfaErrorResponseStruct = type({
  code: optional(string()),
  message: string(),
});

export const TokenReasonStruct = object({
  operation: pattern(string(), /^[A-Za-z0-9_.:-]{1,64}$/u),
  description: optional(string()),
});

export const BeginEnrollmentRequestStruct = refine(
  object({
    type: MfaCredentialTypeStruct,
    email: optional(size(string(), 3, 254)),
    reason: TokenReasonStruct,
  }),
  'BeginEnrollmentRequest',
  (value) =>
    value.type !== 'email_otp' || value.email !== undefined
      ? true
      : 'email is required for email_otp enrollment',
);

const PasskeyEnrollmentProofStruct = object({
  type: literal('passkey'),
  attestation: RegistrationResponseJSONStruct,
});

const EmailOtpProofStruct = object({
  type: literal('email_otp'),
  code: pattern(string(), /^\d{6}$/u),
});

export const CompleteEnrollmentRequestStruct = refine(
  object({
    type: MfaCredentialTypeStruct,
    flowId: string(),
    proof: union([PasskeyEnrollmentProofStruct, EmailOtpProofStruct]),
  }),
  'CompleteEnrollmentRequest',
  (value) =>
    value.type === value.proof.type ? true : 'type must match the proof type',
);

export const BeginStepUpRequestStruct = object({
  credentialType: MfaCredentialTypeStruct,
  reason: TokenReasonStruct,
});

const PasskeyStepUpProofStruct = object({
  type: literal('passkey'),
  assertion: AuthenticationResponseJSONStruct,
});

const EmailOtpStepUpProofStruct = object({
  type: literal('email_otp'),
  code: pattern(string(), /^\d{6}$/u),
});

export const CompleteStepUpRequestStruct = refine(
  object({
    credentialType: MfaCredentialTypeStruct,
    flowId: string(),
    proof: union([PasskeyStepUpProofStruct, EmailOtpStepUpProofStruct]),
  }),
  'CompleteStepUpRequest',
  (value) =>
    value.credentialType === value.proof.type
      ? true
      : 'credentialType must match the proof type',
);

export const GetElevatedTokenRequestStruct = object({
  maxSessionAgeMs: optional(min(integer(), 0)),
});

export const ElevatedTokenClaimsStruct = type({
  sub: string(),
  aal: literal(2),
  exp: integer(),
  amr: union([MfaCredentialTypeStruct, array(MfaCredentialTypeStruct)]),
});

function formatStructError(error: StructError): string {
  return error
    .failures()
    .map(({ path, message }) => `[${path.join('.')}] ${message}`)
    .join(', ');
}

/**
 * Validates data received from the authentication service.
 *
 * @param value - Untrusted response data.
 * @param struct - Expected response structure.
 * @throws MfaError if the response does not match the structure.
 */
export function assertValidMfaResponse<Value>(
  value: unknown,
  struct: Struct<Value>,
): asserts value is Value {
  try {
    assert(value, struct);
  } catch (error) {
    if (error instanceof StructError) {
      throw new MfaError('invalid_response', formatStructError(error));
    }
    /* istanbul ignore next */
    throw error;
  }
}

/**
 * Validates data received from an untyped controller boundary.
 *
 * @param value - Untrusted request data.
 * @param struct - Expected request structure.
 * @throws MfaError if the request does not match the structure.
 */
export function assertValidMfaRequest<Value>(
  value: unknown,
  struct: Struct<Value>,
): asserts value is Value {
  try {
    assert(value, struct);
  } catch (error) {
    if (error instanceof StructError) {
      throw new MfaError('invalid_request', formatStructError(error));
    }
    /* istanbul ignore next */
    throw error;
  }
}

/**
 * Validates and normalizes claims from an elevated access token.
 *
 * @param value - Decoded JWT payload.
 * @returns Validated claims with `amr` represented as an array.
 * @throws ElevatedTokenInvalidError if claims are missing or invalid.
 */
export function parseElevatedTokenClaims(value: unknown): {
  sub: string;
  aal: 2;
  exp: number;
  amr: ('passkey' | 'email_otp')[];
} {
  try {
    assert(value, ElevatedTokenClaimsStruct);
  } catch (error) {
    if (error instanceof StructError) {
      throw new ElevatedTokenInvalidError(formatStructError(error));
    }
    /* istanbul ignore next */
    throw error;
  }

  return {
    sub: value.sub,
    aal: value.aal,
    exp: value.exp,
    amr: Array.isArray(value.amr) ? value.amr : [value.amr],
  };
}
