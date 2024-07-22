import type { RestrictedControllerMessenger, ControllerGetStateAction, ControllerStateChangeEvent } from '@metamask/base-controller';
import type { NetworkClientId, NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { fetchExchangeRate as defaultFetchExchangeRate } from './crypto-compare-service';
/**
 * @type CurrencyRateState
 * @property currencyRates - Object keyed by native currency
 * @property currencyRates.conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property currencyRates.conversionRate - Conversion rate from current base asset to the current currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property usdConversionRate - Conversion rate from usd to the current currency
 */
export type CurrencyRateState = {
    currentCurrency: string;
    currencyRates: Record<string, {
        conversionDate: number | null;
        conversionRate: number | null;
        usdConversionRate: number | null;
    }>;
};
declare const name = "CurrencyRateController";
export type CurrencyRateStateChange = ControllerStateChangeEvent<typeof name, CurrencyRateState>;
export type CurrencyRateControllerEvents = CurrencyRateStateChange;
export type GetCurrencyRateState = ControllerGetStateAction<typeof name, CurrencyRateState>;
export type CurrencyRateControllerActions = GetCurrencyRateState;
type AllowedActions = NetworkControllerGetNetworkClientByIdAction;
type CurrencyRateMessenger = RestrictedControllerMessenger<typeof name, CurrencyRateControllerActions | AllowedActions, CurrencyRateControllerEvents, AllowedActions['type'], never>;
/**
 * Controller that passively polls on a set interval for an exchange rate from the current network
 * asset to the user's preferred currency.
 */
export declare class CurrencyRateController extends StaticIntervalPollingController<typeof name, CurrencyRateState, CurrencyRateMessenger> {
    private readonly mutex;
    private readonly fetchExchangeRate;
    private readonly includeUsdRate;
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
     * Sets a currency to track.
     *
     * @param currentCurrency - ISO 4217 currency code.
     */
    setCurrentCurrency(currentCurrency: string): Promise<void>;
    /**
     * Updates the exchange rate for the current currency and native currency pair.
     *
     * @param nativeCurrency - The ticker symbol for the chain.
     */
    updateExchangeRate(nativeCurrency: string): Promise<void>;
    /**
     * Prepare to discard this controller.
     *
     * This stops any active polling.
     */
    destroy(): void;
    /**
     * Updates exchange rate for the current currency.
     *
     * @param networkClientId - The network client ID used to get a ticker value.
     * @returns The controller state.
     */
    _executePoll(networkClientId: NetworkClientId): Promise<void>;
}
export default CurrencyRateController;
//# sourceMappingURL=CurrencyRateController.d.ts.map