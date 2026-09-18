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
  MfaIdentityMissingError,
  MfaRateLimitedError,
  MfaUnavailableError,
  MfaVerificationFailedError,
  OtpResendCooldownError,
  TooManyAttemptsError,
} from '../../errors.js';
import { asRecord } from '../../utils/as-record.js';
import {
  AuthenticationResponseJSONStruct,
  MfaCredentialsResponseStruct,
  MfaEnrollCompleteResponseStruct,
  MfaEnrollResponseStruct,
  MfaErrorResponseStruct,
  MfaVerifyCompleteResponseStruct,
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
  MfaCredentialStatus,
  MfaCredentialType,
  MfaEnrollCompleteRequest,
  MfaEnrollRequest,
  MfaVerifyCompleteRequest,
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

export type MfaStepUpAssertion = {
  /** AAL2 assertion JWT to exchange at Hydra for an elevated access token. */
  token: string;
  /** Assertion lifetime in seconds. */
  expiresIn: number;
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

/**
 * Reads a `Retry-After` header as a delay. The human-readable error message is
 * deliberately not parsed: the API documents it as unstable.
 *
 * @param response - The throttled response.
 * @returns The delay in milliseconds, or undefined without a usable header.
 */
function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/**
 * Reads and validates the JSON error body of a failed MFA request.
 *
 * When the body parses as JSON but does not match the documented error
 * shape, a `message` field is salvaged if present so callers still get a
 * useful diagnostic instead of a content-free fallback.
 *
 * @param response - The failed response.
 * @returns The validated error body, a best-effort salvage of it, or
 * undefined when the body could not be parsed as JSON at all.
 */
async function readErrorBody(
  response: Response,
): Promise<{ code?: string; message: string } | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }

  try {
    assertValidMfaResponse(body, MfaErrorResponseStruct);
    return body;
  } catch {
    const message = asRecord(body)?.message;
    return typeof message === 'string' ? { message } : undefined;
  }
}

async function throwMfaError(
  response: Response,
  errorPrefix: string,
): Promise<never> {
  const { status } = response;
  const body = await readErrorBody(response);
  const message = `${errorPrefix}: ${body?.message ?? `HTTP ${status}`}`;

  // Status-only classification first: gateways and load balancers answer
  // 401/429/502 without the service's JSON body, and the caller still needs
  // to invalidate its session, honour Retry-After, or back off.
  if (status === HTTP_STATUS_CODES.UNAUTHORIZED) {
    throw new MfaError('authentication_required', message, { status });
  }

  const code = body?.code;
  switch (code) {
    case 'credential_already_enrolled':
    case 'email_already_enrolled':
      throw new CredentialAlreadyEnrolledError(code, message, status);
    case 'credential_not_enrolled':
      throw new CredentialNotEnrolledError(message, status);
    case 'flow_expired':
    case 'invalid_flow':
      throw new MfaFlowExpiredError(code, message, status);
    case 'mfa_identity_missing':
      throw new MfaIdentityMissingError(message, status);
    case 'invalid_code':
    case 'invalid_attestation':
    case 'invalid_assertion':
      throw new MfaVerificationFailedError(code, message, status);
    case 'too_many_attempts':
      throw new TooManyAttemptsError(message, status);
    case 'max_passkeys_reached':
      throw new MaxPasskeysReachedError(message, status);
    case 'max_identifiers_reached':
      throw new MaxIdentifiersReachedError(message, status);
    case 'otp_resend_cooldown':
      throw new OtpResendCooldownError(
        message,
        parseRetryAfter(response),
        status,
      );
    case 'kratos_unavailable':
      throw new MfaUnavailableError(message, status);
    default:
      break;
  }

  if (status === HTTP_STATUS_CODES.TOO_MANY_REQUESTS) {
    throw new MfaRateLimitedError(message, parseRetryAfter(response), status);
  }
  if (status === HTTP_STATUS_CODES.BAD_GATEWAY) {
    throw new MfaUnavailableError(message, status);
  }
  if (!body) {
    throw new MfaError(
      'invalid_response',
      `${errorPrefix}: Unexpected error response (HTTP ${status})`,
      { status },
    );
  }
  throw new MfaError(code ?? 'server_error', message, { status });
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
 * @returns The AAL2 assertion JWT and its lifetime in seconds.
 */
export async function mfaVerifyComplete(
  env: Env,
  accessToken: string,
  params: VerificationCompletionParams,
): Promise<MfaStepUpAssertion> {
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
  assertValidMfaResponse(json, MfaVerifyCompleteResponseStruct);
  return { token: json.token, expiresIn: json.expires_in };
}

function isSupportedStatus(status: string): status is MfaCredentialStatus {
  return status === 'active' || status === 'pending';
}

/**
 * Maps a server credential to its public controller representation.
 *
 * Unknown credential types or statuses are dropped so the server can extend
 * either without invalidating the whole list.
 *
 * @param credential - Validated server credential.
 * @returns A supported credential, or null when it cannot be represented.
 */
export function toEnrolledCredential(
  credential: MfaCredential,
): EnrolledCredential | null {
  const { credential_type: type, status } = credential;
  if (!isSupportedStatus(status)) {
    log.warn(`Ignoring MFA credential with unsupported status: ${status}`);
    return null;
  }

  const enrolledAt = parseEnrolledAt(credential.enrolled_at);
  const base = {
    status,
    ...(enrolledAt === undefined ? {} : { enrolledAt }),
  };

  if (type === 'passkey') {
    return {
      type,
      ...base,
      ...(credential.passkey?.display_name
        ? { displayName: credential.passkey.display_name }
        : {}),
    };
  }

  if (type === 'email_otp' && credential.email?.address !== undefined) {
    return {
      type,
      ...base,
      email: credential.email.address,
      // The spec marks `verified` optional; an active row is verified.
      verified: credential.email.verified ?? status === 'active',
    };
  }

  log.warn(`Ignoring unsupported or incomplete MFA credential: ${type}`);
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
