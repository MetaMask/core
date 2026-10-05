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
