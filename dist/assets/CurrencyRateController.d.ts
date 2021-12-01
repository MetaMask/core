import type { Patch } from 'immer';
import { BaseController } from '../BaseControllerV2';
import { fetchExchangeRate as defaultFetchExchangeRate } from '../apis/crypto-compare';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
/**
 * @type CurrencyRateState
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from current base asset to the current currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property nativeCurrency - Symbol for the base asset used for conversion
 * @property pendingCurrentCurrency - The currency being switched to
 * @property pendingNativeCurrency - The base asset currency being switched to
 * @property usdConversionRate - Conversion rate from usd to the current currency
 */
export declare type CurrencyRateState = {
    conversionDate: number | null;
    conversionRate: number | null;
    currentCurrency: string;
    nativeCurrency: string;
    pendingCurrentCurrency: string | null;
    pendingNativeCurrency: string | null;
    usdConversionRate: number | null;
};
declare const name = "CurrencyRateController";
export declare type CurrencyRateStateChange = {
    type: `${typeof name}:stateChange`;
    payload: [CurrencyRateState, Patch[]];
};
export declare type GetCurrencyRateState = {
    type: `${typeof name}:getState`;
    handler: () => CurrencyRateState;
};
declare type CurrencyRateMessenger = RestrictedControllerMessenger<typeof name, GetCurrencyRateState, CurrencyRateStateChange, never, never>;
/**
 * Controller that passively polls on a set interval for an exchange rate from the current base
 * asset to the current currency
 */
export declare class CurrencyRateController extends BaseController<typeof name, CurrencyRateState, CurrencyRateMessenger> {
    private mutex;
    private intervalId?;
    private intervalDelay;
    private fetchExchangeRate;
    private includeUsdRate;
    /**
     * Creates a CurrencyRateController instance.
     *
     * @param options - Constructor options.
     * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate.
     * @param options.interval - The polling interval, in milliseconds.
     * @param options.messenger - A reference to the messaging system.
     * @param options.state - Initial state to set on this controller.
     * @param options.fetchExchangeRate - Fetches the exchange rate from an external API. This option is primarily meant for use in unit tests.
     */
    constructor({ includeUsdRate, interval, messenger, state, fetchExchangeRate, }: {
        includeUsdRate?: boolean;
        interval?: number;
        messenger: CurrencyRateMessenger;
        state?: Partial<CurrencyRateState>;
        fetchExchangeRate?: typeof defaultFetchExchangeRate;
    });
    /**
     * Start polling for the currency rate.
     */
    start(): Promise<void>;
    /**
     * Stop polling for the currency rate.
     */
    stop(): void;
    /**
     * Prepare to discard this controller.
     *
     * This stops any active polling.
     */
    destroy(): void;
    /**
     * Sets a currency to track.
     *
     * @param currentCurrency - ISO 4217 currency code.
     */
    setCurrentCurrency(currentCurrency: string): Promise<void>;
    /**
     * Sets a new native currency.
     *
     * @param symbol - Symbol for the base asset.
     */
    setNativeCurrency(symbol: string): Promise<void>;
    private stopPolling;
    /**
     * Starts a new polling interval.
     */
    private startPolling;
    /**
     * Updates exchange rate for the current currency.
     *
     * @returns The controller state.
     */
    updateExchangeRate(): Promise<CurrencyRateState | void>;
}
export default CurrencyRateController;
