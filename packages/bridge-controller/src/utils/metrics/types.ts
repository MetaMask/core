/* eslint-disable @typescript-eslint/naming-convention */
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type {
  InputPrimaryDenomination,
  SortOrder,
  StatusTypes,
} from '../../types.js';
import type { FeatureId } from '../../validators/feature-flags.js';
import type {
  UnifiedSwapBridgeEventName,
  BatchSellMetricsEventName,
  BatchSellMetricsLocation,
  BridgeControllerMetricsEventName,
  BridgeControllerMetricsLocation,
  MetricsActionType,
  MetricsSwapType,
  PollingStatus,
} from './constants.js';

/**
 * These properties map to properties required by the segment-schema. For example: https://github.com/Consensys/segment-schema/blob/main/libraries/properties/cross-chain-swaps-action.yaml
 */
export type RequestParams = {
  chain_id_source: CaipChainId;
  chain_id_destination: CaipChainId | null;
  token_symbol_source: string;
  token_symbol_destination: string | null;
  token_address_source: CaipAssetType;
  token_address_destination: CaipAssetType | null;
  /**
   * Client-supplied security classification for the destination token
   * (e.g. from token security/scanning data). Stored on the controller
   * and merged into every analytics event that includes
   * `token_address_destination`. Pass `null` when no security data is
   * available for the selected destination token.
   */
  token_security_type_destination: string | null;
};

export type AccountHardwareType =
  | 'Ledger'
  | 'Trezor'
  | 'QR Hardware'
  | 'Lattice'
  | null;

export type RequestMetadata = {
  slippage_limit?: number; // undefined === auto
  custom_slippage: boolean;
  usd_amount_source: number; // Use quoteResponse when available
  stx_enabled: boolean;
  is_hardware_wallet: boolean;
  account_hardware_type: AccountHardwareType;
  swap_type: MetricsSwapType;
  security_warnings: string[];
};

export type QuoteFetchData = {
  can_submit: boolean;
  best_quote_provider?: `${string}_${string}`;
  quotes_count: number;
  quotes_list: `${string}_${string}`[];
  initial_load_time_all_quotes: number;
  price_impact: number;
  has_gas_included_quote: boolean;
};

export type TradeData = {
  usd_quoted_gas: number;
  gas_included: boolean;
  gas_included_7702: boolean;
  quoted_time_minutes: number;
  usd_quoted_return: number;
  provider: `${string}_${string}`;
};

export type TxStatusData = {
  allowance_reset_transaction?: StatusTypes;
  approval_transaction?: StatusTypes;
  source_transaction?: StatusTypes;
  destination_transaction?: StatusTypes;
};

export type InputPrimaryDenominationData = {
  input_primary_denomination?: InputPrimaryDenomination;
};

export type InputKeys =
  | 'token_source'
  | 'token_destination'
  | 'chain_source'
  | 'chain_destination'
  | 'slippage'
  | 'token_amount_source';

export type InputValues = {
  token_source: CaipAssetType;
  token_destination: CaipAssetType;
  chain_source: CaipChainId;
  chain_destination: CaipChainId;
  slippage: number;
  token_amount_source: string;
};

export type QuoteWarning =
  | 'low_return'
  | 'no_quotes'
  | 'insufficient_gas_balance'
  | 'insufficient_gas_for_selected_quote'
  | 'insufficient_balance'
  | 'market_closed'
  | 'price_impact'
  | 'quote_expired'
  | 'tx_alert';

type BatchSellChainProperties = {
  chain_id_source: CaipChainId;
  chain_id_destination: CaipChainId | null;
};

type BatchSellTokenPageEventContext = BatchSellChainProperties & {
  location: BatchSellMetricsLocation;
};

type BatchSellSourceTokenEventContext = BatchSellTokenPageEventContext & {
  source_token_symbols: string[];
  source_token_addresses: CaipAssetType[];
};

type BatchSellQuotePageEventContext = BatchSellSourceTokenEventContext & {
  destination_token_symbol: string;
  destination_token_address: CaipAssetType;
  usd_amount_source_tokens: number[];
  usd_amount_source_total: number;
  source_token_slippages: number[];
};

type BatchSellReviewModalSubmittedEventContext =
  BatchSellQuotePageEventContext &
    Pick<TradeData, 'usd_quoted_gas' | 'usd_quoted_return'>;

type BatchSellTokenPageEventProperties = BatchSellChainProperties &
  BatchSellTokenPageEventContext;

type BatchSellSourceTokenEventProperties = BatchSellChainProperties &
  BatchSellSourceTokenEventContext & {
    source_token_count: number;
  };

type BatchSellQuotePageEventProperties = BatchSellChainProperties &
  BatchSellQuotePageEventContext & {
    source_token_count: number;
  };

type BatchSellReviewModalSubmittedEventProperties = BatchSellChainProperties &
  BatchSellReviewModalSubmittedEventContext & {
    source_token_count: number;
  };

type SharedEventContextFromClient = {
  ab_tests?: Record<string, string>;
  active_ab_tests?: { key: string; value: string }[];
  feature_id: FeatureId;
};

type OptionalLocationContextFromClient<T> = T extends {
  location: unknown;
}
  ? object
  : { location?: BridgeControllerMetricsLocation };

/**
 * Properties that are required to be provided when trackUnifiedSwapBridgeEvent is called.
 * Most events receive an optional location via RequiredEventContextFromClient;
 * Batch Sell events define their own required location enum.
 */
type RequiredEventContextFromClientBase = {
  [UnifiedSwapBridgeEventName.ButtonClicked]: Pick<
    RequestParams,
    'token_symbol_source' | 'token_symbol_destination'
  > & { environment_type?: string };
  // When type is object, the payload can be anything
  [UnifiedSwapBridgeEventName.PageViewed]: object;
  [UnifiedSwapBridgeEventName.InputChanged]: {
    input:
      | 'token_source'
      | 'token_destination'
      | 'chain_source'
      | 'chain_destination'
      | 'slippage'
      | 'token_amount_source';
    input_value: InputValues[keyof InputValues];
    input_amount_preset?: string;
  };
  [UnifiedSwapBridgeEventName.FiatCryptoToggleClicked]: {
    token_symbol_source: string;
    token_symbol_destination: string | null;
    previous_primary_denomination: InputPrimaryDenomination;
    new_primary_denomination: InputPrimaryDenomination;
    chain_id_source?: RequestParams['chain_id_source'];
    chain_id_destination?: RequestParams['chain_id_destination'];
    token_address_source?: RequestParams['token_address_source'];
    token_address_destination?: RequestParams['token_address_destination'];
    token_security_type_destination?: RequestParams['token_security_type_destination'];
    swap_type?: RequestMetadata['swap_type'];
  };
  [UnifiedSwapBridgeEventName.InputSourceDestinationSwitched]: {
    token_symbol_source: RequestParams['token_symbol_source'];
    token_symbol_destination: RequestParams['token_symbol_destination'];
    token_address_source: RequestParams['token_address_source'];
    token_address_destination: RequestParams['token_address_destination'];
    token_security_type_destination: RequestParams['token_security_type_destination'];
    chain_id_source: RequestParams['chain_id_source'];
    chain_id_destination: RequestParams['chain_id_destination'];
  } & Pick<RequestMetadata, 'security_warnings'>;
  [UnifiedSwapBridgeEventName.QuotesRequested]: Pick<
    RequestMetadata,
    'stx_enabled' | 'usd_amount_source'
  > & {
    token_symbol_source: RequestParams['token_symbol_source'];
    token_symbol_destination: RequestParams['token_symbol_destination'];
    token_security_type_destination: RequestParams['token_security_type_destination'];
  } & InputPrimaryDenominationData;
  [UnifiedSwapBridgeEventName.QuotesReceived]: TradeData &
    Pick<RequestParams, 'token_symbol_source' | 'token_symbol_destination'> &
    InputPrimaryDenominationData & {
      warnings: QuoteWarning[];
      best_quote_provider: QuoteFetchData['best_quote_provider'];
      price_impact: QuoteFetchData['price_impact'];
      can_submit: QuoteFetchData['can_submit'];
      usd_balance_source?: number;
      has_sufficient_gas_for_quote?: boolean | null;
    };
  [UnifiedSwapBridgeEventName.QuotesError]: Pick<
    RequestMetadata,
    'stx_enabled'
  > & {
    token_symbol_source: RequestParams['token_symbol_source'];
    token_symbol_destination: RequestParams['token_symbol_destination'];
  } & Pick<RequestMetadata, 'security_warnings'>;
  // Emitted by BridgeStatusController
  [UnifiedSwapBridgeEventName.Submitted]: TradeData &
    Pick<QuoteFetchData, 'price_impact'> &
    Omit<RequestMetadata, 'security_warnings'> &
    Pick<
      RequestParams,
      | 'token_symbol_source'
      | 'token_symbol_destination'
      | 'token_address_source'
      | 'token_address_destination'
      | 'chain_id_source'
      | 'chain_id_destination'
      | 'token_security_type_destination'
    > & {
      action_type: MetricsActionType;
      batch_id?: string;
    } & InputPrimaryDenominationData;
  [UnifiedSwapBridgeEventName.Completed]: TradeData &
    Pick<QuoteFetchData, 'price_impact'> &
    Omit<RequestMetadata, 'security_warnings'> &
    TxStatusData &
    RequestParams & {
      actual_time_minutes: number;
      usd_actual_return: number;
      usd_actual_gas: number;
      quote_vs_execution_ratio: number;
      quoted_vs_used_gas_ratio: number;
      action_type: MetricsActionType;
      batch_id?: string;
      transaction_internal_id?: string;
    } & InputPrimaryDenominationData;
  [UnifiedSwapBridgeEventName.Failed]: (
    | // Tx failed before confirmation
      (Pick<
        RequestMetadata,
        | 'stx_enabled'
        | 'usd_amount_source'
        | 'is_hardware_wallet'
        | 'account_hardware_type'
      > &
        Pick<
          RequestParams,
          | 'token_symbol_source'
          | 'token_symbol_destination'
          | 'token_address_source'
          | 'token_address_destination'
          | 'token_security_type_destination'
        >)
    // Tx failed after confirmation
    | (RequestParams &
        RequestMetadata &
        TxStatusData & {
          actual_time_minutes: number;
        })
  ) &
    TradeData &
    Pick<QuoteFetchData, 'price_impact'> & {
      error_message: string;
      batch_id?: string;
    };
  [UnifiedSwapBridgeEventName.PollingStatusUpdated]: {
    polling_status: PollingStatus;
    retry_attempts: number;
  };
  [UnifiedSwapBridgeEventName.StatusValidationFailed]: {
    failures: string[];
    refresh_count: number;
  } & Partial<RequestParams>;
  // Emitted by clients
  [UnifiedSwapBridgeEventName.AllQuotesOpened]: Pick<
    TradeData,
    'gas_included'
  > &
    Pick<QuoteFetchData, 'price_impact'> &
    Pick<RequestParams, 'token_symbol_source' | 'token_symbol_destination'> & {
      stx_enabled: RequestMetadata['stx_enabled'];
      can_submit: QuoteFetchData['can_submit'];
    };
  [UnifiedSwapBridgeEventName.AllQuotesSorted]: Pick<
    TradeData,
    'gas_included'
  > &
    Pick<QuoteFetchData, 'price_impact'> &
    Pick<RequestParams, 'token_symbol_source' | 'token_symbol_destination'> & {
      stx_enabled: RequestMetadata['stx_enabled'];
      sort_order: SortOrder;
      best_quote_provider: QuoteFetchData['best_quote_provider'];
      can_submit: QuoteFetchData['can_submit'];
    };
  [UnifiedSwapBridgeEventName.QuoteSelected]: TradeData & {
    is_best_quote: boolean;
    best_quote_provider: QuoteFetchData['best_quote_provider'];
    price_impact: QuoteFetchData['price_impact'];
    can_submit: QuoteFetchData['can_submit'];
  };
  [UnifiedSwapBridgeEventName.AssetDetailTooltipClicked]: {
    token_name: string;
    token_symbol: string;
    token_contract: string;
    chain_name: string;
    chain_id: string;
  };
  [UnifiedSwapBridgeEventName.QuotesValidationFailed]: {
    failures: string[];
  };
  [UnifiedSwapBridgeEventName.AssetPickerOpened]: {
    asset_location: 'source' | 'destination';
  };
  [BatchSellMetricsEventName.BatchSellTokenPageViewed]: BatchSellTokenPageEventContext;
  [BatchSellMetricsEventName.BatchSellTokenPageContinueClicked]: BatchSellSourceTokenEventContext;
  [BatchSellMetricsEventName.BatchSellQuotePageViewed]: BatchSellQuotePageEventContext;
  [BatchSellMetricsEventName.BatchSellQuotePageReviewClicked]: BatchSellQuotePageEventContext;
  [BatchSellMetricsEventName.BatchSellReviewModalSubmitted]: BatchSellReviewModalSubmittedEventContext;
};

/**
 * Properties that are required to be provided when trackUnifiedSwapBridgeEvent is called.
 * This combines the event-specific properties from RequiredEventContextFromClientBase
 * with an optional `location` property. When `location` is omitted, the controller
 * falls back to the value stored via `setLocation()` (defaults to Unknown).
 *
 * `ab_tests` is the legacy field and `active_ab_tests` is the newer field.
 * Both are kept for a migration window and are treated as separate payloads.
 */
export type RequiredEventContextFromClient = {
  [K in keyof RequiredEventContextFromClientBase]: K extends BatchSellMetricsEventName
    ? RequiredEventContextFromClientBase[K]
    : RequiredEventContextFromClientBase[K] &
        OptionalLocationContextFromClient<
          RequiredEventContextFromClientBase[K]
        > &
        SharedEventContextFromClient;
};

/**
 * Properties that can be derived from the bridge controller state
 */
export type EventPropertiesFromControllerState = {
  [UnifiedSwapBridgeEventName.ButtonClicked]: RequestParams;
  [UnifiedSwapBridgeEventName.PageViewed]: RequestParams &
    Omit<
      RequestMetadata,
      'stx_enabled' | 'usd_amount_source' | 'security_warnings'
    > &
    InputPrimaryDenominationData;
  [UnifiedSwapBridgeEventName.InputChanged]: {
    input: InputKeys;
    input_value: string;
  };
  [UnifiedSwapBridgeEventName.FiatCryptoToggleClicked]: RequestParams &
    Pick<RequestMetadata, 'swap_type'>;
  [UnifiedSwapBridgeEventName.InputSourceDestinationSwitched]: RequestParams;
  [UnifiedSwapBridgeEventName.QuotesRequested]: RequestParams &
    RequestMetadata & {
      has_sufficient_funds: boolean;
    } & InputPrimaryDenominationData;
  [UnifiedSwapBridgeEventName.QuotesReceived]: RequestParams &
    RequestMetadata &
    QuoteFetchData &
    TradeData & {
      refresh_count: number; // starts from 0
    } & InputPrimaryDenominationData;
  [UnifiedSwapBridgeEventName.QuotesError]: RequestParams &
    RequestMetadata & {
      has_sufficient_funds: boolean;
      error_message: string;
    };
  [UnifiedSwapBridgeEventName.Submitted]: null;
  [UnifiedSwapBridgeEventName.Completed]: null;
  [UnifiedSwapBridgeEventName.Failed]: RequestParams &
    RequestMetadata &
    TxStatusData &
    TradeData &
    Pick<QuoteFetchData, 'price_impact'> & {
      actual_time_minutes: number;
    };
  [UnifiedSwapBridgeEventName.AllQuotesOpened]: RequestParams &
    RequestMetadata &
    TradeData &
    QuoteFetchData;
  [UnifiedSwapBridgeEventName.AllQuotesSorted]: RequestParams &
    RequestMetadata &
    TradeData &
    QuoteFetchData;
  [UnifiedSwapBridgeEventName.QuoteSelected]: RequestParams &
    RequestMetadata &
    QuoteFetchData &
    TradeData;
  [UnifiedSwapBridgeEventName.AssetDetailTooltipClicked]: null;
  [UnifiedSwapBridgeEventName.QuotesValidationFailed]: RequestParams & {
    refresh_count: number;
  };
  [UnifiedSwapBridgeEventName.StatusValidationFailed]: RequestParams;
  [UnifiedSwapBridgeEventName.AssetPickerOpened]: null;
  [UnifiedSwapBridgeEventName.PollingStatusUpdated]: TradeData &
    Pick<QuoteFetchData, 'price_impact'> &
    Omit<RequestMetadata, 'security_warnings'> &
    Pick<
      RequestParams,
      | 'token_symbol_source'
      | 'token_symbol_destination'
      | 'chain_id_source'
      | 'chain_id_destination'
    > & {
      batch_id?: string;
    };
  [BatchSellMetricsEventName.BatchSellTokenPageViewed]: BatchSellTokenPageEventProperties;
  [BatchSellMetricsEventName.BatchSellTokenPageContinueClicked]: BatchSellSourceTokenEventProperties;
  [BatchSellMetricsEventName.BatchSellQuotePageViewed]: BatchSellQuotePageEventProperties;
  [BatchSellMetricsEventName.BatchSellQuotePageReviewClicked]: BatchSellQuotePageEventProperties;
  [BatchSellMetricsEventName.BatchSellReviewModalSubmitted]: BatchSellReviewModalSubmittedEventProperties;
};

type SharedCrossChainSwapsEventProperties<
  T extends BridgeControllerMetricsEventName,
> =
  | {
      feature_id: FeatureId;
      action_type: MetricsActionType;
      location: BridgeControllerMetricsLocation;
      ab_tests?: Record<string, string>;
      active_ab_tests?: { key: string; value: string }[];
    }
  | Pick<EventPropertiesFromControllerState, T>[T]
  | Pick<RequiredEventContextFromClient, T>[T];

/**
 * trackUnifiedSwapBridgeEvent payload properties consist of required properties from the client
 * and properties from the bridge controller
 *
 * `ab_tests` will be deprecated in favor of `active_ab_tests` in the future.
 * `ab_tests` and `active_ab_tests` intentionally coexist during migration.
 */
export type CrossChainSwapsEventProperties<
  T extends BridgeControllerMetricsEventName,
> = T extends BatchSellMetricsEventName
  ? Pick<EventPropertiesFromControllerState, T>[T]
  : SharedCrossChainSwapsEventProperties<T>;
