import { isSafeChainId, isValidHexAddress } from '@metamask/controller-utils';
import {
  array,
  boolean,
  coerce,
  enums,
  integer,
  is,
  nullable,
  optional,
  pattern,
  refine,
  string,
  type,
  validate,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

/** Maximum number of distinct chain IDs per request (SAA limit). */
export const APPROVAL_DASHBOARD_MAX_CHAIN_IDS = 20;

/** Schema major this client understands; any minor/patch is accepted. */
const SUPPORTED_SCHEMA_MAJOR = 0;

const RISK_VERDICTS = [
  'malicious',
  'warning',
  'benign',
  'unknown',
  'error',
] as const;
const CHAIN_STATUSES = ['success', 'unsupported', 'failed', 'timeout'] as const;

const HEX_CHAIN_ID_REGEX = /^0x[0-9a-fA-F]+$/u;
const SCHEMA_VERSION_REGEX = /^(\d+)\.\d+\.\d+/u;

const NonNegativeIntegerStruct = refine(
  integer(),
  'NonNegativeInteger',
  (value) => value >= 0 || 'Expected a nonnegative integer',
);
const ChainIdStruct = refine(
  integer(),
  'ChainId',
  (value) => value > 0 || 'Expected a positive integer',
);
const NonEmptyStringStruct = refine(
  string(),
  'NonEmptyString',
  (value) => value.length > 0 || 'Expected a non-empty string',
);

// `type()` structs accept and pass through unknown fields, per the contract's
// compatibility rule. The only coercions are the two fallbacks the contract
// defines: unknown risk verdict -> `unknown`, and unknown chain status ->
// `failed` + `unverified`.
const RecordStruct = type({
  /** Server-assigned stable ID. Never recomputed by the client. */
  id: NonEmptyStringStruct,
  account: string(),
  /** Decimal chain ID, as returned by SAA. */
  chainId: ChainIdStruct,
  standard: enums(['erc20', 'erc721', 'erc1155']),
  approvalKind: enums(['allowance', 'operator']),
  tokenId: nullable(string()),
  token: type({
    address: string(),
    name: string(),
    symbol: string(),
    decimals: nullable(NonNegativeIntegerStruct),
    logo: nullable(string()),
    metadataStatus: enums(['complete', 'partial']),
  }),
  spender: type({
    address: string(),
    label: nullable(string()),
    labelSource: nullable(string()),
  }),
  allowance: type({
    /** Canonical decimal integer string. */
    raw: pattern(string(), /^\d+$/u),
    isUnlimited: boolean(),
  }),
  /** Not summable across spenders; `null` when valuation is unavailable. */
  exposure: nullable(
    type({
      amountUsd: pattern(string(), /^\d+(?:\.\d+)?$/u),
      basis: enums(['allowance', 'balance']),
      priceSource: string(),
      /** Calculation time, not the age of the underlying balance or price. */
      observedAt: NonEmptyStringStruct,
    }),
  ),
  /** Explains a null exposure. Absence does not imply exposure is available. */
  exposureUnavailableReason: optional(string()),
  risk: type({
    /** `unknown` must not be treated as benign. */
    verdict: coerce(enums(RISK_VERDICTS), string(), (verdict) =>
      is(verdict, enums(RISK_VERDICTS)) ? verdict : 'unknown',
    ),
    features: array(type({ type: string(), description: optional(string()) })),
    source: nullable(string()),
    assessedAt: nullable(string()),
  }),
  freshness: type({
    /** Request-generation time, not an on-chain observation time. */
    observedAt: NonEmptyStringStruct,
    indexedThroughBlock: nullable(NonNegativeIntegerStruct),
    observedBlock: nullable(NonNegativeIntegerStruct),
  }),
});

const ChainResultStruct = coerce(
  type({
    chainId: ChainIdStruct,
    status: enums(CHAIN_STATUSES),
    /** `unverified` must not be rendered as "no approvals". */
    completeness: enums(['verified', 'unverified']),
    recordCount: NonNegativeIntegerStruct,
    /** Whether retrying may produce a more complete result. */
    retryable: boolean(),
    errorCode: optional(string()),
    note: optional(string()),
  }),
  type({ status: string() }),
  (result) =>
    is(result.status, enums(CHAIN_STATUSES))
      ? result
      : { ...result, status: 'failed', completeness: 'unverified' },
);

const ResponseStruct = type({
  /** Lowercased account address, matching the requested address. */
  account: string(),
  records: array(RecordStruct),
  /** Exactly one entry per requested chain. */
  chainResults: array(ChainResultStruct),
  generatedAt: NonEmptyStringStruct,
  freshness: type({
    /** Whether the allowance cache was actually bypassed. */
    forced: boolean(),
    /** Allowance-path cache-age budget, in milliseconds. */
    maxStalenessMs: NonNegativeIntegerStruct,
  }),
  schemaVersion: string(),
});

export type ApprovalDashboardRecord = Infer<typeof RecordStruct>;
export type ApprovalDashboardChainResult = Infer<typeof ChainResultStruct>;
export type ApprovalDashboardResponse = Infer<typeof ResponseStruct>;

export type ApprovalDashboardRequest = {
  /** EVM account address (`0x` + 40 hex characters, any case). */
  address: string;
  /**
   * Hex chain IDs (e.g. `'0x1'`). Duplicates are removed; at most 20
   * distinct chains.
   */
  chainIds: string[];
  /**
   * Ask SAA to bypass the allowance response cache. The server may throttle
   * it; check `freshness.forced` on the response.
   */
  forceFresh?: boolean;
};

export type ApprovalDashboardErrorCode =
  | 'invalid_request'
  | 'http_error'
  | 'network_error'
  | 'timeout'
  | 'invalid_response'
  | 'incompatible_schema'
  | 'service_unavailable';

/**
 * Thrown by `SecurityAlertsApiService:getApprovalDashboard` for any failure. A failed call never
 * resolves to an empty inventory.
 */
export class ApprovalDashboardError extends Error {
  readonly code: ApprovalDashboardErrorCode;

  /** Whether retrying the same request may succeed. */
  readonly retryable: boolean;

  /** HTTP status, for `http_error` only. */
  readonly httpStatus?: number;

  constructor(
    code: ApprovalDashboardErrorCode,
    message: string,
    options: { retryable?: boolean; httpStatus?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApprovalDashboardError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus;
  }
}

/**
 * Validate the request and convert hex chain IDs to the decimal integers SAA
 * expects.
 *
 * @param request - The public request.
 * @returns The SAA request body.
 */
export function buildApprovalDashboardRequestBody(
  request: ApprovalDashboardRequest,
): {
  address: string;
  chainIds: number[];
  forceFresh: boolean;
} {
  if (!isValidHexAddress(request.address, { allowNonPrefixed: false })) {
    throw new ApprovalDashboardError(
      'invalid_request',
      'address must be 0x followed by 40 hex characters',
    );
  }

  const chainIds = new Set<number>();
  for (const chainId of request.chainIds) {
    if (
      !HEX_CHAIN_ID_REGEX.test(chainId) ||
      !isSafeChainId(chainId as `0x${string}`)
    ) {
      throw new ApprovalDashboardError(
        'invalid_request',
        `Invalid hex chain ID: ${chainId}`,
      );
    }
    chainIds.add(Number(chainId));
    if (chainIds.size > APPROVAL_DASHBOARD_MAX_CHAIN_IDS) {
      throw new ApprovalDashboardError(
        'invalid_request',
        `chainIds cannot contain more than ${APPROVAL_DASHBOARD_MAX_CHAIN_IDS} distinct chains`,
      );
    }
  }
  if (chainIds.size === 0) {
    throw new ApprovalDashboardError(
      'invalid_request',
      'chainIds must not be empty',
    );
  }

  return {
    address: request.address.toLowerCase(),
    chainIds: [...chainIds],
    forceFresh: request.forceFresh ?? false,
  };
}

/**
 * Build an `invalid_response` error.
 *
 * @param message - What was wrong with the response.
 * @param cause - The underlying error, if any.
 * @returns The error.
 */
export function invalidApprovalDashboardResponse(
  message: string,
  cause?: unknown,
): ApprovalDashboardError {
  return new ApprovalDashboardError(
    'invalid_response',
    `Invalid approval dashboard response: ${message}`,
    { cause },
  );
}

/**
 * Validate an SAA response body against the contract and the request it
 * answers, applying the contract's fallbacks.
 *
 * @param body - The parsed JSON body.
 * @param request - The SAA request body that produced it.
 * @param request.address - The lowercased requested address.
 * @param request.chainIds - The requested decimal chain IDs.
 * @returns The validated response.
 */
export function parseApprovalDashboardResponse(
  body: unknown,
  request: { address: string; chainIds: number[] },
): ApprovalDashboardResponse {
  // Check the schema major first so a breaking change is reported as such
  // rather than as a field-level validation failure.
  const version = is(body, type({ schemaVersion: string() }))
    ? SCHEMA_VERSION_REGEX.exec(body.schemaVersion)
    : null;
  if (!version) {
    throw invalidApprovalDashboardResponse(
      'missing or malformed schemaVersion',
    );
  }
  if (Number(version[1]) !== SUPPORTED_SCHEMA_MAJOR) {
    throw new ApprovalDashboardError(
      'incompatible_schema',
      `Unsupported approval dashboard schema version ${version[0]}`,
    );
  }

  const [error, response] = validate(body, ResponseStruct, { coerce: true });
  if (error) {
    throw invalidApprovalDashboardResponse(error.message, error);
  }

  const answered = response.chainResults.map(({ chainId }) => chainId);
  if (
    answered.length !== request.chainIds.length ||
    !request.chainIds.every((chainId) => answered.includes(chainId))
  ) {
    throw invalidApprovalDashboardResponse(
      'chainResults do not match the requested chains',
    );
  }
  for (const record of [response, ...response.records]) {
    if (record.account.toLowerCase() !== request.address) {
      throw invalidApprovalDashboardResponse(
        'account does not match the requested address',
      );
    }
  }
  if (response.records.some(({ chainId }) => !answered.includes(chainId))) {
    throw invalidApprovalDashboardResponse('record for an unrequested chain');
  }

  return response;
}
