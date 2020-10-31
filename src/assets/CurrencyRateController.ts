import { createSlice } from '@reduxjs/toolkit';

import { fetchExchangeRate as defaultFetchExchangeRate } from '../crypto-compare';
import { getAnonymizedState as _getAnonymizedState, getPersistedState as _getPersistedState } from '../schema-transform';

import type { AppDispatch, RootState } from '../store';

const name = 'CurrencyRate';

const POLLING_INTERVAL = 180000;

enum POLLING_STATE {
  STARTED = 'STARTED',
  STOPPED = 'STOPPED',
}

/**
 * @type CurrencyRateState
 *
 * Currency rate controller state
 *
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from current base asset to the current currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property includeUsdRate - Whether to include the USD conversion rate in all
 *   polling in addition to the current currency
 * @property nativeCurrency - Symbol for the base asset used for conversion
 * @property pendingCurrentCurrency - The currency being switched to
 * @property pendingNativeCurrency - The base asset currency being switched to
 * @property usdConversionRate - Conversion rate from usd to the current currency
 */
export interface CurrencyRateState {
  conversionDate: number;
  conversionRate: number;
  currentCurrency: string;
  includeUsdRate: boolean;
  nativeCurrency: string;
  pendingCurrentCurrency: string | null;
  pendingNativeCurrency: string | null;
  pollingStartTime: number | null;
  pollingState: POLLING_STATE;
  updateStartTime: number | null;
  usdConversionRate?: number;
}

const initialState: CurrencyRateState = {
  conversionDate: 0,
  conversionRate: 0,
  currentCurrency: 'usd',
  includeUsdRate: false,
  nativeCurrency: 'ETH',
  pendingCurrentCurrency: null,
  pendingNativeCurrency: null,
  pollingStartTime: null,
  pollingState: POLLING_STATE.STOPPED,
  updateStartTime: null,
  usdConversionRate: undefined,
};

const schema = {
  conversionDate: { persist: true, anonymous: true },
  conversionRate: { persist: true, anonymous: true },
  currentCurrency: { persist: true, anonymous: true },
  includeUsdRate: { persist: true, anonymous: true },
  nativeCurrency: { persist: true, anonymous: true },
  pendingCurrentCurrency: { persist: false, anonymous: true },
  pendingNativeCurrency: { persist: false, anonymous: true },
  pollingStartTime: { persist: false, anonymous: true },
  pollingState: { persist: false, anonymous: true },
  updateStartTime: { persist: false, anonymous: true },
  usdConversionRate: { persist: true, anonymous: true },
};

const slice = createSlice({
  name,
  initialState,
  reducers: {
    pollingStarted: (state, action) => {
      state.pollingStartTime = action.payload;
    },
    pollingStopped: (state) => {
      state.pollingStartTime = null;
    },
    pollFinished: (state, action) => {
      const { conversionDate, conversionRate, usdConversionRate } = action.payload;
      state.conversionDate = conversionDate;
      state.conversionRate = conversionRate;
      if (state.includeUsdRate) {
        state.usdConversionRate = usdConversionRate;
      }
    },
    started: (state) => {
      state.pollingState = POLLING_STATE.STARTED;
    },
    stopped: (state) => {
      state.pollingState = POLLING_STATE.STOPPED;
    },
    updateCurrencyStarted: (state, action) => {
      const { currentCurrency, nativeCurrency, updateStartTime } = action.payload;
      if (!currentCurrency && !nativeCurrency) {
        throw new Error('Missing currency; either current or native currency must be specified');
      }
      if (currentCurrency) {
        state.pendingCurrentCurrency = currentCurrency;
      }
      if (nativeCurrency) {
        state.pendingNativeCurrency = nativeCurrency;
      }
      state.updateStartTime = updateStartTime;
    },
    updateCurrencyFailed: (state) => {
      state.pendingCurrentCurrency = null;
      state.pendingNativeCurrency = null;
      state.updateStartTime = null;
    },
    updateCurrencyFinished: (state, action) => {
      const { conversionDate, conversionRate, usdConversionRate } = action.payload;
      state.conversionDate = conversionDate;
      state.conversionRate = conversionRate;
      if (state.includeUsdRate) {
        state.usdConversionRate = usdConversionRate;
      }
      if (state.pendingCurrentCurrency) {
        state.currentCurrency = state.pendingCurrentCurrency;
        state.pendingCurrentCurrency = null;
      }
      if (state.pendingCurrentCurrency) {
        state.nativeCurrency = state.pendingCurrentCurrency;
        state.pendingNativeCurrency = null;
      }
      state.updateStartTime = null;
    },
    usdRateEnabled: (state) => {
      state.includeUsdRate = true;
    },
  },
});

const { actions, reducer } = slice;

export default reducer;

// Selectors

export const getAnonymizedState = (state: RootState): Partial<CurrencyRateState> =>
  _getAnonymizedState(state[name], schema);
export const getPersistedState = (state: RootState): Partial<CurrencyRateState> =>
  _getPersistedState(state[name], schema);
const getPollingStartTime = (state: RootState) => state[name].pollingStartTime;
const getCurrentCurrency = (state: RootState) => state[name].currentCurrency;
const getNativeCurrency = (state: RootState) => state[name].nativeCurrency;
const getPendingOrActiveCurrentCurrency = (state: RootState) =>
  state[name].pendingCurrentCurrency || getCurrentCurrency(state);
const getPendingOrActiveNativeCurrency = (state: RootState) =>
  state[name].pendingNativeCurrency || getNativeCurrency(state);
const getUpdateStartTime = (state: RootState) => state[name].updateStartTime;

// Action creators

const {
  pollingStarted,
  pollingStopped,
  pollFinished,
  started,
  stopped,
  updateCurrencyStarted,
  updateCurrencyFailed,
  updateCurrencyFinished,
  usdRateEnabled,
} = actions;

export { usdRateEnabled };

export function start() {
  return (dispatch: AppDispatch) => {
    dispatch(started());
    dispatch(startPolling());
  };
}

export function stop() {
  return (dispatch: AppDispatch) => {
    dispatch(stopped());
    dispatch(pollingStopped());
  };
}

async function poll(
  dispatch: AppDispatch,
  getState: () => RootState,
  fetchExchangeRate = defaultFetchExchangeRate,
) {
  const state = getState();
  const currentCurrency = getCurrentCurrency(state);
  const nativeCurrency = getNativeCurrency(state);

  const fetchStartTime = Date.now();
  const { conversionDate, conversionRate, usdConversionRate } = await fetchExchangeRate(
    currentCurrency,
    nativeCurrency,
    state[name].includeUsdRate,
  );

  // bail if polling has stopped or restarted
  const updatedState = getState();
  const pollingStartTime = getPollingStartTime(updatedState);
  if (pollingStartTime === null || pollingStartTime > fetchStartTime) {
    return;
  }

  dispatch(pollFinished({ conversionDate, conversionRate, usdConversionRate }));
}

function startPolling(fetchExchangeRate = defaultFetchExchangeRate) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const { pollingState } = getState()[name];
    if (pollingState === POLLING_STATE.STOPPED) {
      return;
    }
    const pollingStartTime = Date.now();
    dispatch(pollingStarted(pollingStartTime));
    poll(dispatch, getState, fetchExchangeRate);

    const intervalHandle = setInterval(
      () => {
        const state = getState();
        const updatedPollingStartTime = getPollingStartTime(state);
        if (pollingStartTime !== updatedPollingStartTime) {
          clearInterval(intervalHandle);
          return;
        }
        poll(dispatch, getState, fetchExchangeRate);
      },
      POLLING_INTERVAL,
    );
  };
}

export function updateCurrency(
  { currentCurrency, nativeCurrency }: { currentCurrency: string; nativeCurrency: string },
  fetchExchangeRate = defaultFetchExchangeRate,
) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    if (!currentCurrency && !nativeCurrency) {
      throw new Error('Missing currency; either current or native currency must be specified');
    }

    dispatch(pollingStopped());
    const updateStartTime = Date.now();
    dispatch(updateCurrencyStarted({ currentCurrency, nativeCurrency, updateStartTime }));

    let updateReplaced = false;

    try {
      const state = getState();
      const pendingOrActiveCurrentCurrency = getPendingOrActiveCurrentCurrency(state);
      const pendingOrActiveNativeCurrency = getPendingOrActiveNativeCurrency(state);

      const { conversionDate, conversionRate, usdConversionRate } = await fetchExchangeRate(
        pendingOrActiveCurrentCurrency,
        pendingOrActiveNativeCurrency,
        state[name].includeUsdRate,
      );

      // bail if another update has started already
      const updatedState = getState();
      const updatedUpdateStartTime = getUpdateStartTime(updatedState);
      if (updateStartTime !== updatedUpdateStartTime) {
        updateReplaced = true;
      } else {
        dispatch(updateCurrencyFinished({ conversionDate, conversionRate, usdConversionRate }));
      }
    } catch (error) {
      if (!updateReplaced) {
        dispatch(updateCurrencyFailed());
      }
      throw error;
    } finally {
      if (!updateReplaced) {
        dispatch(startPolling(fetchExchangeRate));
      }
    }
  };
}
