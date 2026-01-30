/* eslint-disable id-denylist, no-restricted-syntax, @typescript-eslint/prefer-nullish-coalescing */
// TODO: Fix ESLint errors in this file - tracked for Phase 5 cleanup
import { v4 as uuidv4 } from 'uuid';

import type { ServiceContext } from './ServiceContext';
import { PerpsMeasurementName } from '../constants/performanceMetrics';
import { PERPS_ERROR_CODES } from '../constants/perpsErrorCodes';
import type {
  PerpsTraceNames,
  PerpsTraceOperations,
  PerpsProvider,
  Position,
  GetPositionsParams,
  AccountState,
  GetAccountStateParams,
  HistoricalPortfolioResult,
  GetHistoricalPortfolioParams,
  OrderFill,
  GetOrderFillsParams,
  Funding,
  GetFundingParams,
  Order,
  GetOrdersParams,
  MarketInfo,
  GetMarketsParams,
  GetAvailableDexsParams,
  LiquidationPriceParams,
  MaintenanceMarginParams,
  FeeCalculationParams,
  FeeCalculationResult,
  OrderParams,
  ClosePositionParams,
  AssetRoute,
  PerpsPlatformDependencies,
  CandleData,
  CandlePeriod,
} from '../types';

// Import trace names and operations from types
const TraceNames: typeof PerpsTraceNames = {
  PlaceOrder: 'Perps Place Order',
  EditOrder: 'Perps Edit Order',
  CancelOrder: 'Perps Cancel Order',
  ClosePosition: 'Perps Close Position',
  UpdateTpsl: 'Perps Update TP/SL',
  UpdateMargin: 'Perps Update Margin',
  FlipPosition: 'Perps Flip Position',
  Withdraw: 'Perps Withdraw',
  Deposit: 'Perps Deposit',
  GetPositions: 'Perps Get Positions',
  GetAccountState: 'Perps Get Account State',
  GetMarkets: 'Perps Get Markets',
  OrderFillsFetch: 'Perps Order Fills Fetch',
  OrdersFetch: 'Perps Orders Fetch',
  FundingFetch: 'Perps Funding Fetch',
  GetHistoricalPortfolio: 'Perps Get Historical Portfolio',
  FetchHistoricalCandles: 'Perps Fetch Historical Candles',
  DataLakeReport: 'Perps Data Lake Report',
  WebsocketConnected: 'Perps WebSocket Connected',
  WebsocketDisconnected: 'Perps WebSocket Disconnected',
  WebsocketFirstPositions: 'Perps WebSocket First Positions',
  WebsocketFirstOrders: 'Perps WebSocket First Orders',
  WebsocketFirstAccount: 'Perps WebSocket First Account',
  RewardsApiCall: 'Perps Rewards API Call',
  ConnectionEstablishment: 'Perps Connection Establishment',
  AccountSwitchReconnection: 'Perps Account Switch Reconnection',
} as const;

const TraceOperations: typeof PerpsTraceOperations = {
  Operation: 'perps.operation',
  OrderSubmission: 'perps.order_submission',
  PositionManagement: 'perps.position_management',
  MarketData: 'perps.market_data',
} as const;

/**
 * MarketDataService
 *
 * Handles all read-only data-fetching operations for the Perps controller.
 * This service is stateless and delegates to the provider.
 * The controller is responsible for tracing and state management.
 *
 * Instance-based service with constructor injection of platform dependencies.
 */
export class MarketDataService {
  private readonly deps: PerpsPlatformDependencies;

  /**
   * Create a new MarketDataService instance.
   *
   * @param deps - Platform dependencies for logging, metrics, etc.
   */
  constructor(deps: PerpsPlatformDependencies) {
    this.deps = deps;
  }

  /**
   * Get current positions.
   * Handles full orchestration: tracing, error logging, state management, and provider delegation.
   *
   * @param options - Options for getting positions
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for tracing and state management
   * @returns Array of positions
   */
  async getPositions(options: {
    provider: PerpsProvider;
    params?: GetPositionsParams;
    context: ServiceContext;
  }): Promise<Position[]> {
    const { provider, params, context } = options;
    const traceId = uuidv4();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.GetPositions,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
        },
      });

      const positions = await provider.getPositions(params);

      // Update state on success (if stateManager is provided)
      if (context.stateManager) {
        context.stateManager.update((state) => {
          state.lastUpdateTimestamp = Date.now();
          state.lastError = null;
        });
      }

      traceData = { success: true };
      return positions;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : PERPS_ERROR_CODES.POSITIONS_FAILED;

      // Update error state (if stateManager is provided)
      if (context.stateManager) {
        context.stateManager.update((state) => {
          state.lastError = errorMessage;
          state.lastUpdateTimestamp = Date.now();
        });
      }

      traceData = {
        success: false,
        error: errorMessage,
      };

      throw error;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.GetPositions,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Get order fills for a specific user or order.
   * Handles full orchestration: tracing, error logging, and provider delegation.
   *
   * @param options - Options for getting order fills
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for tracing
   * @returns Array of order fills
   */
  async getOrderFills(options: {
    provider: PerpsProvider;
    params?: GetOrderFillsParams;
    context: ServiceContext;
  }): Promise<OrderFill[]> {
    const { provider, params, context } = options;
    const traceId = uuidv4();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.OrderFillsFetch,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
        },
      });

      const result = await provider.getOrderFills(params);

      traceData = { success: true };
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        tags: {
          feature: 'perps',
          provider: context.tracingContext.provider,
          network: context.tracingContext.isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: context.errorContext.controller,
          data: {
            method: context.errorContext.method,
            params,
          },
        },
      });

      traceData = {
        success: false,
        error: error.message,
      };
      throw err;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.OrderFillsFetch,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Get historical user orders (order lifecycle).
   * Handles full orchestration: tracing, error logging, and provider delegation.
   *
   * @param options - Options for getting orders
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for tracing
   * @returns Array of orders
   */
  async getOrders(options: {
    provider: PerpsProvider;
    params?: GetOrdersParams;
    context: ServiceContext;
  }): Promise<Order[]> {
    const { provider, params, context } = options;
    const traceId = uuidv4();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.OrdersFetch,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
        },
      });

      const result = await provider.getOrders(params);

      traceData = { success: true };
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        tags: {
          feature: 'perps',
          provider: context.tracingContext.provider,
          network: context.tracingContext.isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: context.errorContext.controller,
          data: {
            method: context.errorContext.method,
            params,
          },
        },
      });

      traceData = {
        success: false,
        error: error.message,
      };
      throw err;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.OrdersFetch,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Get current open orders.
   * Handles full orchestration: tracing, error logging, performance measurement, and provider delegation.
   *
   * @param options - Options for getting open orders
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for tracing
   * @returns Array of open orders
   */
  async getOpenOrders(options: {
    provider: PerpsProvider;
    params?: GetOrdersParams;
    context: ServiceContext;
  }): Promise<Order[]> {
    const { provider, params, context } = options;
    const traceId = uuidv4();
    const startTime = this.deps.performance.now();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.OrdersFetch,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
        },
      });

      const result = await provider.getOpenOrders(params);

      const completionDuration = this.deps.performance.now() - startTime;
      this.deps.tracer.setMeasurement(
        PerpsMeasurementName.PerpsGetOpenOrdersOperation,
        completionDuration,
        'millisecond',
      );

      traceData = { success: true };
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        tags: {
          feature: 'perps',
          provider: context.tracingContext.provider,
          network: context.tracingContext.isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: context.errorContext.controller,
          data: {
            method: context.errorContext.method,
            params,
          },
        },
      });

      traceData = {
        success: false,
        error: error.message,
      };
      throw err;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.OrdersFetch,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Get funding rates.
   * Handles full orchestration: tracing, error logging, and provider delegation.
   *
   * @param options - Options for getting funding
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for tracing
   * @returns Array of funding entries
   */
  async getFunding(options: {
    provider: PerpsProvider;
    params?: GetFundingParams;
    context: ServiceContext;
  }): Promise<Funding[]> {
    const { provider, params, context } = options;
    const traceId = uuidv4();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.FundingFetch,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
        },
      });

      const result = await provider.getFunding(params);

      traceData = { success: true };
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        tags: {
          feature: 'perps',
          provider: context.tracingContext.provider,
          network: context.tracingContext.isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: context.errorContext.controller,
          data: {
            method: context.errorContext.method,
            params,
          },
        },
      });

      traceData = {
        success: false,
        error: error.message,
      };
      throw err;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.FundingFetch,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Get account state.
   * Handles full orchestration: tracing, error logging, state management, and provider delegation.
   *
   * @param options - Options for getting account state
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for tracing and state management
   * @returns Account state
   */
  async getAccountState(options: {
    provider: PerpsProvider;
    params?: GetAccountStateParams;
    context: ServiceContext;
  }): Promise<AccountState> {
    const { provider, params, context } = options;
    const traceId = uuidv4();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.GetAccountState,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
          source: params?.source || 'unknown',
        },
      });

      const accountState = await provider.getAccountState(params);

      // Safety check for accountState
      if (!accountState) {
        const error = new Error(
          'Failed to get account state: received null/undefined response',
        );

        this.deps.logger.error(error, {
          tags: {
            feature: 'perps',
            provider: context.tracingContext.provider,
            network: context.tracingContext.isTestnet ? 'testnet' : 'mainnet',
          },
          context: {
            name: context.errorContext.controller,
            data: {
              method: context.errorContext.method,
              operation: 'nullAccountStateCheck',
            },
          },
        });

        throw error;
      }

      // Update state on success (if stateManager is provided)
      if (context.stateManager) {
        context.stateManager.update((state) => {
          state.accountState = accountState;
          state.lastUpdateTimestamp = Date.now();
          state.lastError = null;
        });
      }

      traceData = { success: true };
      return accountState;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Account state fetch failed';

      // Update error state (if stateManager is provided)
      if (context.stateManager) {
        context.stateManager.update((state) => {
          state.lastError = errorMessage;
          state.lastUpdateTimestamp = Date.now();
        });
      }

      traceData = {
        success: false,
        error: errorMessage,
      };

      throw error;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.GetAccountState,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Get historical portfolio data.
   * Handles full orchestration: tracing, error logging, state management, and provider delegation.
   *
   * @param options - Options for getting historical portfolio
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for tracing and state management
   * @returns Historical portfolio result
   */
  async getHistoricalPortfolio(options: {
    provider: PerpsProvider;
    params?: GetHistoricalPortfolioParams;
    context: ServiceContext;
  }): Promise<HistoricalPortfolioResult> {
    const { provider, params, context } = options;
    const traceId = uuidv4();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.GetHistoricalPortfolio,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
        },
      });

      if (!provider.getHistoricalPortfolio) {
        throw new Error('Historical portfolio not supported by provider');
      }

      const result = await provider.getHistoricalPortfolio(params);

      traceData = { success: true };
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to get historical portfolio';
      const error = err instanceof Error ? err : new Error(String(err));

      this.deps.logger.error(error, {
        tags: {
          feature: 'perps',
          provider: context.tracingContext.provider,
          network: context.tracingContext.isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: context.errorContext.controller,
          data: {
            method: context.errorContext.method,
            params,
          },
        },
      });

      // Update error state (if stateManager is provided)
      if (context.stateManager) {
        context.stateManager.update((state) => {
          state.lastError = errorMessage;
          state.lastUpdateTimestamp = Date.now();
        });
      }

      traceData = {
        success: false,
        error: errorMessage,
      };

      throw err;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.GetHistoricalPortfolio,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Get available markets.
   * Handles full orchestration: tracing, error logging, state management, and provider delegation.
   *
   * @param options - Options for getting markets
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for tracing and state management
   * @returns Array of market info
   */
  async getMarkets(options: {
    provider: PerpsProvider;
    params?: GetMarketsParams;
    context: ServiceContext;
  }): Promise<MarketInfo[]> {
    const { provider, params, context } = options;
    const traceId = uuidv4();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.GetMarkets,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
          ...(params?.symbols && {
            symbolCount: String(params.symbols.length),
          }),
          ...(params?.dex !== undefined && { dex: params.dex }),
        },
      });

      const markets = await provider.getMarkets(params);

      // Clear any previous errors on successful call (if stateManager is provided)
      if (context.stateManager) {
        context.stateManager.update((state) => {
          state.lastError = null;
          state.lastUpdateTimestamp = Date.now();
        });
      }

      traceData = { success: true };
      return markets;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : PERPS_ERROR_CODES.MARKETS_FAILED;
      const error = err instanceof Error ? err : new Error(String(err));

      this.deps.logger.error(error, {
        tags: {
          feature: 'perps',
          provider: context.tracingContext.provider,
          network: context.tracingContext.isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: context.errorContext.controller,
          data: {
            method: context.errorContext.method,
            params,
          },
        },
      });

      // Update error state (if stateManager is provided)
      if (context.stateManager) {
        context.stateManager.update((state) => {
          state.lastError = errorMessage;
          state.lastUpdateTimestamp = Date.now();
        });
      }

      traceData = {
        success: false,
        error: errorMessage,
      };

      throw err;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.GetMarkets,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Get available DEXs (HIP-3 support required).
   *
   * @param options - Options for getting available DEXs
   * @param options.provider - The perps provider
   * @param options.params - Optional parameters for the request
   * @param options.context - Service context for error logging
   * @returns Array of DEX names
   */
  async getAvailableDexs(options: {
    provider: PerpsProvider;
    params?: GetAvailableDexsParams;
    context: ServiceContext;
  }): Promise<string[]> {
    const { provider, params } = options;

    try {
      if (!provider.getAvailableDexs) {
        throw new Error('Provider does not support HIP-3 DEXs');
      }

      return await provider.getAvailableDexs(params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        context: {
          name: 'MarketDataService.getAvailableDexs',
          data: { params },
        },
      });
      throw err;
    }
  }

  /**
   * Fetch historical candle data for charting.
   * Handles full orchestration: tracing, error logging, state management, and provider delegation.
   *
   * @param options - Options for fetching historical candles
   * @param options.provider - The perps provider
   * @param options.symbol - The asset symbol
   * @param options.interval - The candle period
   * @param options.limit - Maximum number of candles to fetch
   * @param options.endTime - End time for the candle range
   * @param options.context - Service context for tracing and state management
   * @returns Candle data
   */
  async fetchHistoricalCandles(options: {
    provider: PerpsProvider;
    symbol: string;
    interval: CandlePeriod;
    limit?: number;
    endTime?: number;
    context: ServiceContext;
  }): Promise<CandleData> {
    const {
      provider,
      symbol,
      interval,
      limit = 100,
      endTime,
      context,
    } = options;
    const traceId = uuidv4();
    let traceData: { success: boolean; error?: string } | undefined;

    try {
      this.deps.tracer.trace({
        name: TraceNames.FetchHistoricalCandles,
        id: traceId,
        op: TraceOperations.Operation,
        tags: {
          provider: context.tracingContext.provider,
          isTestnet: String(context.tracingContext.isTestnet),
          symbol,
          interval,
        },
      });

      // Check if provider supports historical candles via clientService
      const hyperLiquidProvider = provider as {
        clientService?: {
          fetchHistoricalCandles?: (
            sym: string,
            int: CandlePeriod,
            lim: number,
            end?: number,
          ) => Promise<CandleData>;
        };
      };
      if (!hyperLiquidProvider.clientService?.fetchHistoricalCandles) {
        throw new Error('Historical candles not supported by provider');
      }

      const result =
        await hyperLiquidProvider.clientService.fetchHistoricalCandles(
          symbol,
          interval,
          limit,
          endTime,
        );

      traceData = { success: true };
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch historical candles';
      const error = err instanceof Error ? err : new Error(String(err));

      this.deps.logger.error(error, {
        tags: {
          feature: 'perps',
          provider: context.tracingContext.provider,
          network: context.tracingContext.isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: context.errorContext.controller,
          data: {
            method: context.errorContext.method,
            symbol,
            interval,
            limit,
            endTime,
          },
        },
      });

      // Update error state (if stateManager is provided)
      if (context.stateManager) {
        context.stateManager.update((state) => {
          state.lastError = errorMessage;
          state.lastUpdateTimestamp = Date.now();
        });
      }

      traceData = {
        success: false,
        error: errorMessage,
      };

      throw err;
    } finally {
      this.deps.tracer.endTrace({
        name: TraceNames.FetchHistoricalCandles,
        id: traceId,
        data: traceData,
      });
    }
  }

  /**
   * Calculate liquidation price for a position.
   *
   * @param options - Options for calculating liquidation price
   * @param options.provider - The perps provider
   * @param options.params - Liquidation price parameters
   * @param options.context - Service context for error logging
   * @returns Liquidation price as string
   */
  async calculateLiquidationPrice(options: {
    provider: PerpsProvider;
    params: LiquidationPriceParams;
    context: ServiceContext;
  }): Promise<string> {
    const { provider, params } = options;

    try {
      return await provider.calculateLiquidationPrice(params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        context: {
          name: 'MarketDataService.calculateLiquidationPrice',
          data: { params },
        },
      });
      throw err;
    }
  }

  /**
   * Calculate maintenance margin for a position.
   *
   * @param options - Options for calculating maintenance margin
   * @param options.provider - The perps provider
   * @param options.params - Maintenance margin parameters
   * @param options.context - Service context for error logging
   * @returns Maintenance margin as number
   */
  async calculateMaintenanceMargin(options: {
    provider: PerpsProvider;
    params: MaintenanceMarginParams;
    context: ServiceContext;
  }): Promise<number> {
    const { provider, params } = options;

    try {
      return await provider.calculateMaintenanceMargin(params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        context: {
          name: 'MarketDataService.calculateMaintenanceMargin',
          data: { params },
        },
      });
      throw err;
    }
  }

  /**
   * Get maximum leverage for an asset.
   *
   * @param options - Options for getting max leverage
   * @param options.provider - The perps provider
   * @param options.asset - The asset symbol
   * @param options.context - Service context for error logging
   * @returns Maximum leverage as number
   */
  async getMaxLeverage(options: {
    provider: PerpsProvider;
    asset: string;
    context: ServiceContext;
  }): Promise<number> {
    const { provider, asset } = options;

    try {
      return await provider.getMaxLeverage(asset);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        context: {
          name: 'MarketDataService.getMaxLeverage',
          data: { asset },
        },
      });
      throw err;
    }
  }

  /**
   * Calculate fees for an order.
   *
   * @param options - Options for calculating fees
   * @param options.provider - The perps provider
   * @param options.params - Fee calculation parameters
   * @param options.context - Service context for error logging
   * @returns Fee calculation result
   */
  async calculateFees(options: {
    provider: PerpsProvider;
    params: FeeCalculationParams;
    context: ServiceContext;
  }): Promise<FeeCalculationResult> {
    const { provider, params } = options;

    try {
      return await provider.calculateFees(params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        context: {
          name: 'MarketDataService.calculateFees',
          data: { params },
        },
      });
      throw err;
    }
  }

  /**
   * Validate an order before placement.
   *
   * @param options - Options for validating order
   * @param options.provider - The perps provider
   * @param options.params - Order parameters
   * @param options.context - Service context for error logging
   * @returns Validation result
   */
  async validateOrder(options: {
    provider: PerpsProvider;
    params: OrderParams;
    context: ServiceContext;
  }): Promise<{ isValid: boolean; error?: string }> {
    const { provider, params } = options;

    try {
      return await provider.validateOrder(params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        context: {
          name: 'MarketDataService.validateOrder',
          data: { params },
        },
      });
      throw err;
    }
  }

  /**
   * Validate a position close request.
   *
   * @param options - Options for validating close position
   * @param options.provider - The perps provider
   * @param options.params - Close position parameters
   * @param options.context - Service context for error logging
   * @returns Validation result
   */
  async validateClosePosition(options: {
    provider: PerpsProvider;
    params: ClosePositionParams;
    context: ServiceContext;
  }): Promise<{ isValid: boolean; error?: string }> {
    const { provider, params } = options;

    try {
      return await provider.validateClosePosition(params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        context: {
          name: 'MarketDataService.validateClosePosition',
          data: { params },
        },
      });
      throw err;
    }
  }

  /**
   * Get supported withdrawal routes (synchronous).
   * Note: This method doesn't log errors to avoid needing context for a synchronous getter.
   *
   * @param options - Options for getting withdrawal routes
   * @param options.provider - The perps provider
   * @returns Array of asset routes
   */
  getWithdrawalRoutes(options: { provider: PerpsProvider }): AssetRoute[] {
    const { provider } = options;

    try {
      return provider.getWithdrawalRoutes();
    } catch {
      // Silent fail - withdrawal routes are not critical
      return [];
    }
  }

  /**
   * Get block explorer URL (synchronous).
   *
   * @param options - Options for getting block explorer URL
   * @param options.provider - The perps provider
   * @param options.address - Optional address to include in URL
   * @returns Block explorer URL
   */
  getBlockExplorerUrl(options: {
    provider: PerpsProvider;
    address?: string;
  }): string {
    const { provider, address } = options;
    return provider.getBlockExplorerUrl(address);
  }
}
