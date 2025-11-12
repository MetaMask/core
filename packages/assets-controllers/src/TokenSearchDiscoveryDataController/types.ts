import type { Hex } from '@metamask/utils';

import type { EvmAssetWithMarketData } from '../token-prices-service/abstract-token-prices-service';
import type { Token } from '../TokenRatesController';

export type NotFoundTokenDisplayData = {
  found: false;
  chainId: Hex;
  address: string;
  currency: string;
};

export type FoundTokenDisplayData = {
  found: true;
  chainId: Hex;
  address: string;
  currency: string;
  token: Token;
  price: EvmAssetWithMarketData<Hex, string> | null;
};

export type TokenDisplayData = NotFoundTokenDisplayData | FoundTokenDisplayData;
