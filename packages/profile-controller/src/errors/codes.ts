/**
 * Public `SCREAMING_SNAKE_CASE` error codes returned by the Profile API.
 *
 * This list mirrors the public wire codes in the Profile API's
 * `src/common/errors/error-catalog.ts`. Internal storage/provider ids
 * (`DB_*`, `X_API_*`, the internal X OAuth token ids) project onto
 * `SERVICE_UNAVAILABLE`, `BAD_GATEWAY`, `INTERNAL_ERROR`, `CONFLICT`, or
 * `VALIDATION_FAILED` before they reach the wire, so clients never see them.
 */
export const ProfileApiErrorCode = {
  // Authentication and authorization
  AuthTokenMissing: 'AUTH_TOKEN_MISSING',
  AuthTokenInvalid: 'AUTH_TOKEN_INVALID',
  AuthTokenExpired: 'AUTH_TOKEN_EXPIRED',
  AuthTokenSubjectMissing: 'AUTH_TOKEN_SUBJECT_MISSING',
  AuthVerificationUnavailable: 'AUTH_VERIFICATION_UNAVAILABLE',
  AuthEarlyAccessRequired: 'AUTH_EARLY_ACCESS_REQUIRED',
  AuthProfileAccessDenied: 'AUTH_PROFILE_ACCESS_DENIED',

  // Request, routing, and framework
  ValidationFailed: 'VALIDATION_FAILED',
  InvalidJson: 'INVALID_JSON',
  UnsupportedMediaType: 'UNSUPPORTED_MEDIA_TYPE',
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  RouteNotFound: 'ROUTE_NOT_FOUND',
  MethodNotAllowed: 'METHOD_NOT_ALLOWED',
  HttpError: 'HTTP_ERROR',
  RateLimitExceeded: 'RATE_LIMIT_EXCEEDED',
  RequestTimeout: 'REQUEST_TIMEOUT',
  InternalError: 'INTERNAL_ERROR',
  NotImplemented: 'NOT_IMPLEMENTED',
  BadGateway: 'BAD_GATEWAY',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
  GatewayTimeout: 'GATEWAY_TIMEOUT',
  Conflict: 'CONFLICT',

  // Profile
  ProfileNotFound: 'PROFILE_NOT_FOUND',
  ProfileAlreadyExists: 'PROFILE_ALREADY_EXISTS',
  ProfileUsernameImmutable: 'PROFILE_USERNAME_IMMUTABLE',
  ProfileDisplayNameProhibited: 'PROFILE_DISPLAY_NAME_PROHIBITED',
  ProfileDisplayNameNotAllowed: 'PROFILE_DISPLAY_NAME_NOT_ALLOWED',
  ProfileBioProhibited: 'PROFILE_BIO_PROHIBITED',
  ProfileLinkedAddressesCooldown: 'PROFILE_LINKED_ADDRESSES_COOLDOWN',
  ProfileConflict: 'PROFILE_CONFLICT',
  ProfileUpdateConflict: 'PROFILE_UPDATE_CONFLICT',

  // Usernames
  UsernameRequired: 'USERNAME_REQUIRED',
  UsernameTooShort: 'USERNAME_TOO_SHORT',
  UsernameTooLong: 'USERNAME_TOO_LONG',
  UsernameInvalidCharacters: 'USERNAME_INVALID_CHARACTERS',
  UsernameInvalidFormat: 'USERNAME_INVALID_FORMAT',
  UsernameUnavailable: 'USERNAME_UNAVAILABLE',
  UsernameReserved: 'USERNAME_RESERVED',
  UsernameTaken: 'USERNAME_TAKEN',
  UsernameValidationUnavailable: 'USERNAME_VALIDATION_UNAVAILABLE',

  // X OAuth (public codes only; internal token and X API ids project onto
  // INTERNAL_ERROR / BAD_GATEWAY / SERVICE_UNAVAILABLE)
  XOAuthStateInvalid: 'X_OAUTH_STATE_INVALID',
  XOAuthAccessDenied: 'X_OAUTH_ACCESS_DENIED',
  XAccountNotLinked: 'X_ACCOUNT_NOT_LINKED',
  XAccountAlreadyLinked: 'X_ACCOUNT_ALREADY_LINKED',
  XProfileAlreadyLinked: 'X_PROFILE_ALREADY_LINKED',
  XAccountLinkConflict: 'X_ACCOUNT_LINK_CONFLICT',
} as const;

export type ProfileApiErrorCode =
  (typeof ProfileApiErrorCode)[keyof typeof ProfileApiErrorCode];
