import type { UserProfile } from './types';
import type { Env } from '../../shared/env';
import { getEnvUrls } from '../../shared/env';
import { HTTP_STATUS_CODES } from '../constants';
import { RateLimitedError, SignInError } from '../errors';

function parseRetryAfter(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) {
    return null;
  }
  const seconds = Number(retryAfterHeader);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }
  const date = Date.parse(retryAfterHeader);
  if (!Number.isNaN(date)) {
    const diff = date - Date.now();
    return diff > 0 ? diff : null;
  }
  return null;
}

async function handleOtpErrorResponse(
  response: Response,
  errorPrefix: string,
): Promise<never> {
  let detail = response.statusText ?? 'Unknown error';
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const errorDescriptionKey = 'error_description';
    const raw = body.message ?? body[errorDescriptionKey] ?? body.error;
    detail = typeof raw === 'string' ? raw.slice(0, 150) : detail;
  } catch {
    // ignore
  }
  const responseMessage = `HTTP ${response.status} - ${detail}`;

  if (response.status === HTTP_STATUS_CODES.TOO_MANY_REQUESTS) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterMs = parseRetryAfter(retryAfterHeader);
    throw new RateLimitedError(
      `${errorPrefix}: ${responseMessage}`,
      retryAfterMs ?? undefined,
    );
  }
  throw new SignInError(`${errorPrefix}: ${responseMessage}`);
}

export const OTP_EMAIL_INITIATE_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/email/login/initiate`;

export const OTP_EMAIL_VERIFY_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/email/login/verify`;

export const OTP_PHONE_INITIATE_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/phone/login/initiate`;

export const OTP_PHONE_VERIFY_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/phone/login/verify`;

export type InitiateOtpResponse = {
  flowId: string;
  flowType: 'login' | 'registration';
  expiresAt: string;
};

type InitiateApiResponse = {
  flowId: string;
  flowType: string;
  expiresAt: string;
};

type VerifyApiResponse = {
  token: string;
  expiresIn: number;
  profile: {
    profileId: string;
    identifierId: string;
    metaMetricsId: string;
  };
};

const INITIATE_KEYS = {
  flowId: 'flow_id',
  flowType: 'flow_type',
  expiresAt: 'expires_at',
} as const;

const VERIFY_KEYS = {
  token: 'token',
  expiresIn: 'expires_in',
  profile: 'profile',
  profileId: 'profile_id',
  identifierId: 'identifier_id',
  metaMetricsId: 'metametrics_id',
} as const;

const REQUEST_BODY_KEYS = {
  flowId: 'flow_id',
  flowType: 'flow_type',
  otpCode: 'otp_code',
  metametricsId: 'metametrics_id',
  appVersion: 'app_version',
  phoneNumber: 'phone_number',
} as const;

function mapInitiateResponse(
  raw: Record<string, unknown>,
): InitiateApiResponse {
  const flowIdRaw = raw[INITIATE_KEYS.flowId];
  const flowTypeRaw = raw[INITIATE_KEYS.flowType];
  const expiresAtRaw = raw[INITIATE_KEYS.expiresAt];
  return {
    flowId: typeof flowIdRaw === 'string' ? flowIdRaw : '',
    flowType: typeof flowTypeRaw === 'string' ? flowTypeRaw : '',
    expiresAt: typeof expiresAtRaw === 'string' ? expiresAtRaw : '',
  };
}

function mapVerifyResponse(raw: Record<string, unknown>): VerifyApiResponse {
  const tokenRaw = raw[VERIFY_KEYS.token];
  const expiresInRaw = raw[VERIFY_KEYS.expiresIn];
  const profileRaw = raw[VERIFY_KEYS.profile] as
    | Record<string, unknown>
    | undefined;
  const profile = profileRaw ?? {};
  const profileIdRaw = profile[VERIFY_KEYS.profileId];
  const identifierIdRaw = profile[VERIFY_KEYS.identifierId];
  const metaMetricsIdRaw = profile[VERIFY_KEYS.metaMetricsId];
  return {
    token: typeof tokenRaw === 'string' ? tokenRaw : '',
    expiresIn: typeof expiresInRaw === 'number' ? expiresInRaw : 0,
    profile: {
      profileId: typeof profileIdRaw === 'string' ? profileIdRaw : '',
      identifierId: typeof identifierIdRaw === 'string' ? identifierIdRaw : '',
      metaMetricsId:
        typeof metaMetricsIdRaw === 'string' ? metaMetricsIdRaw : '',
    },
  };
}

export type VerifyOtpOptions = {
  flowId: string;
  flowType: 'login' | 'registration';
  otpCode: string;
  metametrics?: {
    metametricsId: string;
    agent: string;
    appVersion?: string;
  };
  accounts?: { address: string; scopes?: string[] }[];
};

export type OtpAuthResponse = {
  token: string;
  expiresIn: number;
  profile: UserProfile;
};

/**
 * Initiates email OTP login. Sends OTP code to the given email.
 *
 * @param email - Email address
 * @param env - Environment
 * @returns Flow ID, type, and expiration for the verify step
 */
export async function initiateEmailLogin(
  email: string,
  env: Env,
): Promise<InitiateOtpResponse> {
  const url = OTP_EMAIL_INITIATE_URL(env);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  if (!response.ok) {
    await handleOtpErrorResponse(response, 'OTP email initiate');
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const data = mapInitiateResponse(raw);
  return {
    flowId: data.flowId,
    flowType: data.flowType as InitiateOtpResponse['flowType'],
    expiresAt: data.expiresAt,
  };
}

/**
 * Initiates phone OTP login. Sends OTP code via SMS to the given phone number.
 *
 * @param phoneNumber - phone number (e.g. +1234567890)
 * @param env - Environment
 * @returns Flow ID, type, and expiration for the verify step
 */
export async function initiatePhoneLogin(
  phoneNumber: string,
  env: Env,
): Promise<InitiateOtpResponse> {
  const url = OTP_PHONE_INITIATE_URL(env);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      [REQUEST_BODY_KEYS.phoneNumber]: phoneNumber.trim(),
    }),
  });
  if (!response.ok) {
    await handleOtpErrorResponse(response, 'OTP phone initiate');
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const data = mapInitiateResponse(raw);
  return {
    flowId: data.flowId,
    flowType: data.flowType as InitiateOtpResponse['flowType'],
    expiresAt: data.expiresAt,
  };
}

/**
 * Verifies email OTP. Returns token, expiresIn, and profile.
 *
 * @param options - Flow ID, flow type, OTP code, optional metametrics/accounts
 * @param env - Environment
 * @returns OtpAuthResponse (token, expiresIn, profile)
 */
export async function verifyEmailLogin(
  options: VerifyOtpOptions,
  env: Env,
): Promise<OtpAuthResponse> {
  const url = OTP_EMAIL_VERIFY_URL(env);
  const body: Record<string, unknown> = {
    [REQUEST_BODY_KEYS.flowId]: options.flowId,
    [REQUEST_BODY_KEYS.flowType]: options.flowType,
    [REQUEST_BODY_KEYS.otpCode]: options.otpCode,
  };
  if (options.metametrics) {
    body.metametrics = {
      [REQUEST_BODY_KEYS.metametricsId]: options.metametrics.metametricsId,
      agent: options.metametrics.agent,
      ...(options.metametrics.appVersion && {
        [REQUEST_BODY_KEYS.appVersion]: options.metametrics.appVersion,
      }),
    };
  }
  if (options.accounts?.length) {
    body.accounts = options.accounts.map((a) => ({
      address: a.address,
      ...(a.scopes && { scopes: a.scopes }),
    }));
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await handleOtpErrorResponse(response, 'OTP email verify');
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const data = mapVerifyResponse(raw);
  return {
    token: data.token,
    expiresIn: data.expiresIn,
    profile: {
      profileId: data.profile.profileId,
      identifierId: data.profile.identifierId,
      metaMetricsId: data.profile.metaMetricsId,
    },
  };
}

/**
 * Verifies phone OTP. Returns token, expiresIn, and profile.
 *
 * @param options - Flow ID, flow type, OTP code, optional metametrics/accounts
 * @param env - Environment
 * @returns OtpAuthResponse (token, expiresIn, profile)
 */
export async function verifyPhoneLogin(
  options: VerifyOtpOptions,
  env: Env,
): Promise<OtpAuthResponse> {
  const url = OTP_PHONE_VERIFY_URL(env);
  const body: Record<string, unknown> = {
    [REQUEST_BODY_KEYS.flowId]: options.flowId,
    [REQUEST_BODY_KEYS.flowType]: options.flowType,
    [REQUEST_BODY_KEYS.otpCode]: options.otpCode,
  };
  if (options.metametrics) {
    body.metametrics = {
      [REQUEST_BODY_KEYS.metametricsId]: options.metametrics.metametricsId,
      agent: options.metametrics.agent,
      ...(options.metametrics.appVersion && {
        [REQUEST_BODY_KEYS.appVersion]: options.metametrics.appVersion,
      }),
    };
  }
  if (options.accounts?.length) {
    body.accounts = options.accounts.map((a) => ({
      address: a.address,
      ...(a.scopes && { scopes: a.scopes }),
    }));
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await handleOtpErrorResponse(response, 'OTP phone verify');
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const data = mapVerifyResponse(raw);
  return {
    token: data.token,
    expiresIn: data.expiresIn,
    profile: {
      profileId: data.profile.profileId,
      identifierId: data.profile.identifierId,
      metaMetricsId: data.profile.metaMetricsId,
    },
  };
}
