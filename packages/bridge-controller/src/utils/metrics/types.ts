import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type {
  UnifiedSwapBridgeEventName,
  MetaMetricsSwapsEventSource,
  MetricsActionType,
  MetricsSwapType,
} from './constants';
import type { SortOrder, StatusTypes } from '../../types';

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
};

export type RequestMetadata = {
  slippage_limit?: number; // undefined === auto
  custom_slippage: boolean;
  usd_amount_source: number; // Use quoteResponse when available
  stx_enabled: boolean;
  is_hardware_wallet: boolean;
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
};

export type TradeData = {
  usd_quoted_gas: number;
  gas_included: boolean;
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

export type InputKeys =
  | 'token_source'
  | 'token_destination'
  | 'chain_source'
  | 'chain_destination'
  | 'slippage';

export type InputValues = {
  token_source: CaipAssetType;
  token_destination: CaipAssetType;
  chain_source: CaipChainId;
  chain_destination: CaipChainId;
  slippage: number;
};

/**
 * Properties that are required to be provided when trackUnifiedSwapBridgeEvent is called
 */
export type RequiredEventContextFromClient = {
  [UnifiedSwapBridgeEventName.ButtonClicked]: {
    location: MetaMetricsSwapsEventSource;
  } & Pick<RequestParams, 'token_symbol_source' | 'token_symbol_destination'>;
  // When type is object, the payload can be anything
  [UnifiedSwapBridgeEventName.PageViewed]: object;
  [UnifiedSwapBridgeEventName.InputChanged]: {
    input:
      | 'token_source'
      | 'token_destination'
      | 'chain_source'
      | 'chain_destination'
      | 'slippage';
    value: InputValues[keyof InputValues];
  };
  [UnifiedSwapBridgeEventName.InputSourceDestinationFlipped]: {
    token_symbol_source: RequestParams['token_symbol_source'];
    token_symbol_destination: RequestParams['token_symbol_destination'];
    token_address_source: RequestParams['token_address_source'];
    token_address_destination: RequestParams['token_address_destination'];
    chain_id_source: RequestParams['chain_id_source'];
    chain_id_destination: RequestParams['chain_id_destination'];
  } & Pick<RequestMetadata, 'security_warnings'>;
  [UnifiedSwapBridgeEventName.QuotesRequested]: Pick<
    RequestMetadata,
    'stx_enabled'
  > & {
    token_symbol_source: RequestParams['token_symbol_source'];
    token_symbol_destination: RequestParams['token_symbol_destination'];
  };
  [UnifiedSwapBridgeEventName.QuotesReceived]: TradeData & {
    warnings: string[]; // TODO standardize warnings
    best_quote_provider: QuoteFetchData['best_quote_provider'];
    price_impact: QuoteFetchData['price_impact'];
  };
  [UnifiedSwapBridgeEventName.QuoteError]: Pick<
    RequestMetadata,
    'stx_enabled'
  > & {
    token_symbol_source: RequestParams['token_symbol_source'];
    token_symbol_destination: RequestParams['token_symbol_destination'];
  } & Pick<RequestMetadata, 'security_warnings'>;
  // Emitted by BridgeStatusController
  [UnifiedSwapBridgeEventName.SnapConfirmationViewed]: Pick<
    QuoteFetchData,
    'price_impact'
  > &
    TradeData & {
      action_type: MetricsActionType;
    };
  [UnifiedSwapBridgeEventName.Submitted]: RequestParams &
    RequestMetadata &
    Pick<QuoteFetchData, 'price_impact'> &
    TradeData & {
      action_type: MetricsActionType;
    };
  [UnifiedSwapBridgeEventName.Completed]: RequestParams &
    RequestMetadata &
    TxStatusData &
    Pick<QuoteFetchData, 'price_impact'> &
    TradeData & {
      actual_time_minutes: number;
      usd_actual_return: number;
      usd_actual_gas: number;
      quote_vs_execution_ratio: number;
      quoted_vs_used_gas_ratio: number;
      action_type: MetricsActionType;
    };
  [UnifiedSwapBridgeEventName.Failed]: RequestParams &
    RequestMetadata &
    Pick<QuoteFetchData, 'price_impact'> &
    TxStatusData &
    TradeData & {
      actual_time_minutes: number;
      error_message: string;
      action_type: MetricsActionType;
    };
  // Emitted by clients
  [UnifiedSwapBridgeEventName.AllQuotesOpened]: Pick<
    TradeData,
    'gas_included'
  > &
    Pick<QuoteFetchData, 'price_impact'> & {
      stx_enabled: RequestMetadata['stx_enabled'];
      token_symbol_source: RequestParams['token_symbol_source'];
      token_symbol_destination: RequestParams['token_symbol_destination'];
    };
  [UnifiedSwapBridgeEventName.AllQuotesSorted]: Pick<
    TradeData,
    'gas_included'
  > &
    Pick<QuoteFetchData, 'price_impact'> & {
      stx_enabled: RequestMetadata['stx_enabled'];
      token_symbol_source: RequestParams['token_symbol_source'];
      token_symbol_destination: RequestParams['token_symbol_destination'];
      sort_order: SortOrder;
      best_quote_provider: QuoteFetchData['best_quote_provider'];
    };
  [UnifiedSwapBridgeEventName.QuoteSelected]: TradeData & {
    is_best_quote: boolean;
    best_quote_provider: QuoteFetchData['best_quote_provider'];
    price_impact: QuoteFetchData['price_impact'];
  };
};

/**
 * Properties that can be derived from the bridge controller state
 */
export type EventPropertiesFromControllerState = {
  [UnifiedSwapBridgeEventName.ButtonClicked]: RequestParams;
  [UnifiedSwapBridgeEventName.PageViewed]: RequestParams;
  [UnifiedSwapBridgeEventName.InputChanged]: {
    input: InputKeys;
    value: string;
  };
  [UnifiedSwapBridgeEventName.InputSourceDestinationFlipped]: RequestParams;
  [UnifiedSwapBridgeEventName.QuotesRequested]: RequestParams &
    RequestMetadata & {
      has_sufficient_funds: boolean;
    };
  [UnifiedSwapBridgeEventName.QuotesReceived]: RequestParams &
    RequestMetadata &
    QuoteFetchData &
    TradeData & {
      refresh_count: number; // starts from 0
    };
  [UnifiedSwapBridgeEventName.QuoteError]: RequestParams &
    RequestMetadata & {
      has_sufficient_funds: boolean;
      error_message: string;
    };
  [UnifiedSwapBridgeEventName.SnapConfirmationViewed]: RequestMetadata &
    RequestParams &
    QuoteFetchData &
    TradeData;
  [UnifiedSwapBridgeEventName.Submitted]: null;
  [UnifiedSwapBridgeEventName.Completed]: null;
  [UnifiedSwapBridgeEventName.Failed]: null;
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
};

/**
 * trackUnifiedSwapBridgeEvent payload properties consist of required properties from the client
 * and properties from the bridge controller
 */
export type CrossChainSwapsEventProperties<
  T extends UnifiedSwapBridgeEventName,
> =
  | {
      action_type: MetricsActionType;
    }
  | Pick<EventPropertiesFromControllerState, T>[T]
  | Pick<RequiredEventContextFromClient, T>[T];
