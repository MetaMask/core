import { configureStore } from '@reduxjs/toolkit';
import thunkMiddleware from 'redux-thunk';

import CurrencyRate from './assets/CurrencyRateController';

const store = configureStore({
  reducer: {
    CurrencyRate,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(thunkMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
