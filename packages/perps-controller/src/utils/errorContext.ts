import { PERPS_CONSTANTS } from '../constants/perpsConfig.js';
import type { PerpsLogger } from '../types/index.js';

export const PERPS_ERROR_OPERATION = {
  ConnectionManagement: 'connection_management',
  OrderManagement: 'order_management',
  PositionManagement: 'position_management',
  FinancialOperations: 'financial_operations',
} as const;

export type PerpsErrorOperation =
  (typeof PERPS_ERROR_OPERATION)[keyof typeof PERPS_ERROR_OPERATION];

export const PERPS_ERROR_ACTION = {
  ConnectionConnection: 'connection_connection',
  FinancialDeposit: 'financial_deposit',
  FinancialWithdrawal: 'financial_withdrawal',
  PlaceOrder: 'place_order',
  EditOrder: 'edit_order',
  CancelOrder: 'cancel_order',
  ClosePosition: 'close_position',
  PositionTpslUpdate: 'position_tpsl_update',
  UpdateMargin: 'update_margin',
  FlipPosition: 'flip_position',
} as const;

export type PerpsErrorAction =
  (typeof PERPS_ERROR_ACTION)[keyof typeof PERPS_ERROR_ACTION];

export const PERPS_ERROR_COMPONENT = {
  ConnectionManager: 'PerpsConnectionManager',
} as const;

export type PerpsErrorComponent =
  (typeof PERPS_ERROR_COMPONENT)[keyof typeof PERPS_ERROR_COMPONENT];

export type PerpsErrorTags = {
  operation: PerpsErrorOperation;
  action?: PerpsErrorAction;
  component?: PerpsErrorComponent;
};

export type PerpsLoggerOptions = NonNullable<
  Parameters<PerpsLogger['error']>[1]
>;

const PROVIDER_ERROR_REPORTED = Symbol('providerErrorReported');

type ProviderErrorReported = {
  [PROVIDER_ERROR_REPORTED]?: true;
};

/**
 * Mark a failed provider result whose underlying error was already reported.
 *
 * The symbol remains internal to Core and survives object spreads used by the
 * aggregated provider without adding a consumer-facing result field.
 *
 * @param result - Provider result to mark.
 * @returns The same result with internal reporting metadata.
 */
export function markProviderErrorReported<Result extends object>(
  result: Result,
): Result & ProviderErrorReported {
  return Object.assign(result, { [PROVIDER_ERROR_REPORTED]: true as const });
}

/**
 * Check whether a provider already reported the error represented by a result.
 *
 * @param result - Provider result returned to a service.
 * @returns Whether the provider owns reporting for the failure.
 */
export function wasProviderErrorReported(result: object): boolean {
  return (result as ProviderErrorReported)[PROVIDER_ERROR_REPORTED] === true;
}

const PROVIDER_ERROR_CAUSE = Symbol('providerErrorCause');

type ProviderErrorCause = {
  [PROVIDER_ERROR_CAUSE]?: Error;
};

/**
 * Attach the normalized error behind a failed provider result.
 *
 * Results carry only stable codes, so a service that owns reporting would
 * otherwise rebuild an error from `result.error` and lose the original
 * failure. The property is non-enumerable so the result's observable shape is
 * unchanged; a wrapper that spreads a result must carry it over with
 * `carryProviderErrorCause`.
 *
 * @param result - Provider result to annotate.
 * @param error - Normalized error whose `cause` holds the original failure.
 * @returns The same result with internal reporting metadata.
 */
export function attachProviderErrorCause<Result extends object>(
  result: Result,
  error: Error,
): Result & ProviderErrorCause {
  return Object.defineProperty(result, PROVIDER_ERROR_CAUSE, {
    value: error,
    enumerable: false,
    configurable: true,
  });
}

/**
 * Copy an attached provider error from one result onto a derived result.
 *
 * @param source - Result that may carry an attached error.
 * @param target - Result derived from `source`, typically by spreading it.
 * @returns `target`, annotated with the source's error when it had one.
 */
export function carryProviderErrorCause<Result extends object>(
  source: object,
  target: Result,
): Result {
  const error = getProviderErrorCause(source);
  return error ? attachProviderErrorCause(target, error) : target;
}

/**
 * Read the normalized error a provider attached to a failed result.
 *
 * @param result - Provider result returned to a service.
 * @returns The attached error, or undefined when the provider attached none.
 */
export function getProviderErrorCause(result: object): Error | undefined {
  return (result as ProviderErrorCause)[PROVIDER_ERROR_CAUSE];
}

/**
 * Build a Perps logger payload with bounded, searchable Sentry tags.
 *
 * Diagnostic data is deliberately kept separate from tags so identifiers,
 * symbols, messages, and method names cannot accidentally create unbounded
 * tag cardinality.
 *
 * @param options - Error context options.
 * @param options.contextName - Stable name for the diagnostic context.
 * @param options.method - Method or boundary where the error occurred.
 * @param options.provider - Optional provider identifier.
 * @param options.network - Optional network environment.
 * @param options.errorTags - Optional bounded dashboard tags.
 * @param options.data - Optional diagnostic data retained in context.
 * @returns Logger options accepted by the platform-provided Perps logger.
 */
export function createPerpsErrorContext(options: {
  contextName: string;
  method: string;
  provider?: string;
  network?: 'mainnet' | 'testnet';
  errorTags?: PerpsErrorTags;
  data?: Record<string, unknown>;
}): PerpsLoggerOptions {
  const { contextName, method, provider, network, errorTags, data } = options;
  const tags: Record<string, string | number> = {
    feature: PERPS_CONSTANTS.FeatureName,
  };

  if (provider !== undefined) {
    tags.provider = provider;
  }
  if (network !== undefined) {
    tags.network = network;
  }
  if (errorTags !== undefined) {
    tags.operation = errorTags.operation;
    if (errorTags.action !== undefined) {
      tags.action = errorTags.action;
    }
    if (errorTags.component !== undefined) {
      tags.component = errorTags.component;
    }
  }

  return {
    tags,
    context: {
      name: contextName,
      data: {
        method,
        ...data,
      },
    },
  };
}
