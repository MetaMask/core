import { Hex } from "@metamask/utils";
import { TokenPrice } from "../token-prices-service/abstract-token-prices-service";
import { Token } from "../TokenRatesController";

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
  price: TokenPrice<Hex, string> | null;
};

export type TokenDisplayData = NotFoundTokenDisplayData | FoundTokenDisplayData;
