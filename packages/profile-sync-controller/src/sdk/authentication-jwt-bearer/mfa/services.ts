import log from 'loglevel';

import type { Env } from '../../../shared/env.js';
import { getEnvUrls } from '../../../shared/env.js';
import { HTTP_STATUS_CODES } from '../../constants.js';
import {
  CredentialAlreadyEnrolledError,
  CredentialNotEnrolledError,
  MaxIdentifiersReachedError,
  MaxPasskeysReachedError,
  MfaError,
  MfaFlowExpiredError,
  MfaUnavailableError,
  MfaVerificationFailedError,
  OtpResendCooldownError,
  TooManyAttemptsError,
} from '../../errors.js';
import {
  AuthenticationResponseJSONStruct,
  AuthenticationResponseStruct,
  MfaCredentialsResponseStruct,
  MfaEnrollCompleteResponseStruct,
  MfaEnrollResponseStruct,
  MfaErrorResponseStruct,
  MfaVerifyResponseStruct,
  PasskeyCreateDataStruct,
  PasskeyRequestDataStruct,
  RegistrationResponseJSONStruct,
  assertValidMfaRequest,
  assertValidMfaResponse,
} from './schemas.js';
import type {
  AuthenticationResponseJSON,
  EnrolledCredential,
  MfaCredential,
  MfaCredentialType,
  MfaEnrollCompleteRequest,
  MfaEnrollRequest,
  MfaVerifyCompleteRequest,
  MfaVerifyCompleteResponse,
  MfaVerifyRequest,
  PublicKeyCredentialCreationOptionsJSON as PasskeyCreationOptions,
  PublicKeyCredentialRequestOptionsJSON as PasskeyRequestOptions,
  RegistrationResponseJSON,
} from './types.js';

export const MFA_ENROLL_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/mfa/enroll`;

export const MFA_ENROLL_COMPLETE_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/mfa/enroll/complete`;

export const MFA_VERIFY_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/mfa/verify`;

export const MFA_VERIFY_COMPLETE_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/mfa/verify/complete`;

export const MFA_CREDENTIALS_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/mfa/credentials`;

type EnrollmentServiceResult = {
  flowId: string;
  expiresAt: number;
  publicKey?: PasskeyCreationOptions;
};

type VerificationServiceResult = {
  flowId: string;
  expiresAt: number;
  publicKey?: PasskeyRequestOptions;
};

type EnrollmentCompletionParams = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  credential_type: MfaCredentialType;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  flow_id: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  otp_code?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  passkey_attestation?: RegistrationResponseJSON;
};

type VerificationCompletionParams = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  credential_type: MfaCredentialType;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  flow_id: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  otp_code?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  passkey_assertion?: AuthenticationResponseJSON;
};

/**
 * Reads a credential's enrollment date. Unlike flow deadlines, this is display
 * metadata, so an unparsable value is dropped instead of rejecting the whole
 * credential list.
 *
 * @param value - The raw `enrolled_at` value, if the server sent one.
 * @returns The epoch milliseconds, or undefined when absent or unparsable.
 */
function parseEnrolledAt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const enrolledAt = Date.parse(value);
  if (Number.isNaN(enrolledAt)) {
    log.warn(`Ignoring unparsable MFA credential enrolled_at: ${value}`);
    return undefined;
  }
  return enrolledAt;
}

function parseExpiresAt(value: string): number {
  const expiresAt = Date.parse(value);
  if (Number.isNaN(expiresAt)) {
    throw new MfaError('invalid_response', `Invalid expires_at: ${value}`);
  }
  return expiresAt;
}

/**
 * Parses passkey creation data embedded in an enrollment response.
 *
 * @param value - JSON-encoded creation options.
 * @returns Validated public-key creation options.
 */
export function parsePasskeyCreateData(value: string): PasskeyCreationOptions {
  try {
    const parsed: unknown = JSON.parse(value);
    assertValidMfaResponse(parsed, PasskeyCreateDataStruct);
    return parsed.publicKey;
  } catch (error) {
    if (error instanceof MfaError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new MfaError('invalid_response', message);
  }
}

/**
 * Parses passkey request data embedded in a verification response.
 *
 * @param value - JSON-encoded request options.
 * @returns Validated public-key request options.
 */
export function parsePasskeyRequestData(value: string): PasskeyRequestOptions {
  try {
    const parsed: unknown = JSON.parse(value);
    assertValidMfaResponse(parsed, PasskeyRequestDataStruct);
    return parsed.publicKey;
  } catch (error) {
    if (error instanceof MfaError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new MfaError('invalid_response', message);
  }
}

function parseRetryAfter(
  response: Response,
  message: string,
): number | undefined {
  const header = response.headers.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds)) {
      return Math.max(0, seconds * 1000);
    }
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now());
    }
  }

  const match =
    /(?:retry|wait)(?:\s+after|\s+for)?\s+(\d+)\s*(?:s|sec|seconds?)/iu.exec(
      message,
    );
  return match?.[1] ? Number(match[1]) * 1000 : undefined;
}

async function throwMfaError(
  response: Response,
  errorPrefix: string,
): Promise<never> {
  let body: unknown;
  try {
    body = await response.json();
    assertValidMfaResponse(body, MfaErrorResponseStruct);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MfaError('invalid_response', `${errorPrefix}: ${message}`, {
      status: response.status,
    });
  }

  const message = `${errorPrefix}: ${body.message}`;
  const { code } = body;
  if (response.status === HTTP_STATUS_CODES.UNAUTHORIZED) {
    throw new MfaError('authentication_required', message, {
      status: response.status,
    });
  }
  switch (code) {
    case 'credential_already_enrolled':
    case 'email_already_enrolled':
      throw new CredentialAlreadyEnrolledError(code, message, response.status);
    case 'credential_not_enrolled':
      throw new CredentialNotEnrolledError(message, response.status);
    case 'flow_expired':
    case 'invalid_flow':
    case 'mfa_identity_missing':
      throw new MfaFlowExpiredError(code, message, response.status);
    case 'invalid_code':
    case 'invalid_attestation':
    case 'invalid_assertion':
      throw new MfaVerificationFailedError(code, message, response.status);
    case 'too_many_attempts':
      throw new TooManyAttemptsError(message, response.status);
    case 'max_passkeys_reached':
      throw new MaxPasskeysReachedError(message, response.status);
    case 'max_identifiers_reached':
      throw new MaxIdentifiersReachedError(message, response.status);
    case 'otp_resend_cooldown':
      throw new OtpResendCooldownError(
        message,
        parseRetryAfter(response, body.message),
        response.status,
      );
    case 'kratos_unavailable':
      throw new MfaUnavailableError(message, response.status);
    default:
      if (response.status === HTTP_STATUS_CODES.TOO_MANY_REQUESTS) {
        throw new OtpResendCooldownError(
          message,
          parseRetryAfter(response, body.message),
          response.status,
        );
      }
      if (response.status === HTTP_STATUS_CODES.BAD_GATEWAY) {
        throw new MfaUnavailableError(message, response.status);
      }
      throw new MfaError(code ?? 'server_error', message, {
        status: response.status,
      });
  }
}

async function requestJson(
  url: string,
  accessToken: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MfaUnavailableError(`MFA request failed: ${message}`);
  }

  if (!response.ok) {
    return await throwMfaError(response, 'MFA request failed');
  }

  try {
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MfaError('invalid_response', message, {
      status: response.status,
    });
  }
}

/**
 * Begins enrollment of an MFA credential.
 *
 * @param env - Authentication environment.
 * @param accessToken - Primary profile access token.
 * @param body - Enrollment request.
 * @returns Validated enrollment flow data.
 */
export async function mfaEnroll(
  env: Env,
  accessToken: string,
  body: MfaEnrollRequest,
): Promise<EnrollmentServiceResult> {
  const json = await requestJson(MFA_ENROLL_URL(env), accessToken, {
    method: 'POST',
    body,
  });
  assertValidMfaResponse(json, MfaEnrollResponseStruct);

  return {
    flowId: json.flow_id,
    expiresAt: parseExpiresAt(json.expires_at),
    ...(json.passkey_create_data
      ? { publicKey: parsePasskeyCreateData(json.passkey_create_data) }
      : {}),
  };
}

/**
 * Completes enrollment of an MFA credential.
 *
 * @param env - Authentication environment.
 * @param accessToken - Primary profile access token.
 * @param params - Flow identifier and enrollment proof.
 */
export async function mfaEnrollComplete(
  env: Env,
  accessToken: string,
  params: EnrollmentCompletionParams,
): Promise<void> {
  let body: MfaEnrollCompleteRequest = {
    credential_type: params.credential_type,
    flow_id: params.flow_id,
    ...(params.otp_code ? { otp_code: params.otp_code } : {}),
  };
  if (params.passkey_attestation) {
    assertValidMfaRequest(
      params.passkey_attestation,
      RegistrationResponseJSONStruct,
    );
    body = {
      ...body,
      passkey_attestation: JSON.stringify(params.passkey_attestation),
    };
  }

  const json = await requestJson(MFA_ENROLL_COMPLETE_URL(env), accessToken, {
    method: 'POST',
    body,
  });
  assertValidMfaResponse(json, MfaEnrollCompleteResponseStruct);
}

/**
 * Begins step-up verification with an enrolled credential.
 *
 * @param env - Authentication environment.
 * @param accessToken - Primary profile access token.
 * @param body - Verification request.
 * @returns Validated verification flow data.
 */
export async function mfaVerify(
  env: Env,
  accessToken: string,
  body: MfaVerifyRequest,
): Promise<VerificationServiceResult> {
  const json = await requestJson(MFA_VERIFY_URL(env), accessToken, {
    method: 'POST',
    body,
  });
  assertValidMfaResponse(json, MfaVerifyResponseStruct);

  return {
    flowId: json.flow_id,
    expiresAt: parseExpiresAt(json.expires_at),
    ...(json.passkey_request_data
      ? { publicKey: parsePasskeyRequestData(json.passkey_request_data) }
      : {}),
  };
}

/**
 * Completes step-up verification with an enrolled credential.
 *
 * @param env - Authentication environment.
 * @param accessToken - Primary profile access token.
 * @param params - Flow identifier and verification proof.
 * @returns Authentication assertion and profile details.
 */
export async function mfaVerifyComplete(
  env: Env,
  accessToken: string,
  params: VerificationCompletionParams,
): Promise<{
  token: string;
  expiresIn: number;
  profile: {
    identifierId: string;
    metaMetricsId: string;
    profileId: string;
    canonicalProfileId: string;
  };
  profileAliases: {
    aliasProfileId: string;
    canonicalProfileId: string;
    identifierIds: { id: string; type: string }[];
  }[];
}> {
  let body: MfaVerifyCompleteRequest = {
    credential_type: params.credential_type,
    flow_id: params.flow_id,
    ...(params.otp_code ? { otp_code: params.otp_code } : {}),
  };
  if (params.passkey_assertion) {
    assertValidMfaRequest(
      params.passkey_assertion,
      AuthenticationResponseJSONStruct,
    );
    body = {
      ...body,
      passkey_assertion: JSON.stringify(params.passkey_assertion),
    };
  }

  const json = await requestJson(MFA_VERIFY_COMPLETE_URL(env), accessToken, {
    method: 'POST',
    body,
  });
  assertValidMfaResponse(json, AuthenticationResponseStruct);
  return mapAuthenticationResponse(json);
}

function mapAuthenticationResponse(json: MfaVerifyCompleteResponse): {
  token: string;
  expiresIn: number;
  profile: {
    identifierId: string;
    metaMetricsId: string;
    profileId: string;
    canonicalProfileId: string;
  };
  profileAliases: {
    aliasProfileId: string;
    canonicalProfileId: string;
    identifierIds: { id: string; type: string }[];
  }[];
} {
  return {
    token: json.token,
    expiresIn: json.expires_in,
    profile: {
      identifierId: json.profile.identifier_id,
      metaMetricsId: json.profile.metametrics_id ?? '',
      profileId: json.profile.profile_id,
      canonicalProfileId: json.profile.profile_id,
    },
    profileAliases: (json.profile_aliases ?? []).map((alias) => ({
      aliasProfileId: alias.alias_profile_id,
      canonicalProfileId: alias.canonical_profile_id,
      identifierIds: alias.identifier_ids ?? [],
    })),
  };
}

/**
 * Maps a server credential to its public controller representation.
 *
 * @param credential - Validated server credential.
 * @returns A supported credential, or null for an unknown future type.
 */
export function toEnrolledCredential(
  credential: MfaCredential,
): EnrolledCredential | null {
  if (credential.credential_type === 'passkey') {
    const enrolledAt = parseEnrolledAt(credential.enrolled_at);
    return {
      type: 'passkey',
      status: credential.status,
      ...(enrolledAt === undefined ? {} : { enrolledAt }),
      ...(credential.passkey?.display_name
        ? { displayName: credential.passkey.display_name }
        : {}),
    };
  }

  if (
    credential.credential_type === 'email_otp' &&
    credential.email?.address !== undefined &&
    credential.email.verified !== undefined
  ) {
    const enrolledAt = parseEnrolledAt(credential.enrolled_at);
    return {
      type: 'email_otp',
      status: credential.status,
      ...(enrolledAt === undefined ? {} : { enrolledAt }),
      email: credential.email.address,
      verified: credential.email.verified,
    };
  }

  log.warn(
    `Ignoring unsupported or incomplete MFA credential: ${credential.credential_type}`,
  );
  return null;
}

/**
 * Gets the credentials enrolled on the canonical profile.
 *
 * @param env - Authentication environment.
 * @param accessToken - Primary profile access token.
 * @returns Supported enrolled credentials.
 */
export async function getMfaCredentials(
  env: Env,
  accessToken: string,
): Promise<EnrolledCredential[]> {
  const json = await requestJson(MFA_CREDENTIALS_URL(env), accessToken);
  assertValidMfaResponse(json, MfaCredentialsResponseStruct);
  return json.credentials
    .map(toEnrolledCredential)
    .filter((credential): credential is EnrolledCredential =>
      Boolean(credential),
    );
}
