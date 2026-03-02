import type { RelayQuote } from '../relay/types';

export type FiatQuote = {
  provider: string;
  quote: {
    amountOut: number | string;
    providerFee?: number | string;
    networkFee?: number | string;
    extraFee?: number | string;
    crypto?: {
      assetId?: string;
      chainId?: string;
      decimals?: number;
    };
    cryptoId?: string;
  } & Record<string, unknown>;
} & Record<string, unknown>;

export type FiatQuotesResponse = {
  success?: FiatQuote[];
} & Record<string, unknown>;

export type FiatOriginalQuote = {
  fiatQuote: FiatQuote;
  relayQuote: RelayQuote;
};
