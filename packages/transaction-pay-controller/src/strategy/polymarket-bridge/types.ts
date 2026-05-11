import type { Hex } from '@metamask/utils';

import type { RelayQuote } from '../relay/types';

/**
 * Strategy-level quote type. The Polymarket bridge withdraw flow delegates
 * cross-chain routing to Relay, so the quote it carries is a Relay quote.
 */
export type PolymarketBridgeQuote = {
  relayQuote: RelayQuote;
};

export type PolymarketBridgeWalletCall = {
  target: Hex;
  value: bigint;
  data: Hex;
};

export type PolymarketBridgeRelayerSubmitRequest = {
  type: 'WALLET';
  from: Hex;
  to: Hex;
  nonce: string;
  signature: Hex;
  depositWalletParams: {
    depositWallet: Hex;
    deadline: string;
    calls: {
      target: string;
      value: string;
      data: string;
    }[];
  };
};

export type PolymarketBridgeRelayerSubmitResponse = {
  transactionID: string;
  state: string;
};

export type PolymarketBridgeRelayerStatusResponse = {
  transactionHash: string | null;
  state: PolymarketRelayerState;
  from: string;
  to: string;
  proxyAddress: string;
  data: string;
  nonce: string;
  signature: string;
  type: string;
  createdAt: string;
  updatedAt: string;
};

export type PolymarketRelayerState =
  | 'STATE_NEW'
  | 'STATE_EXECUTED'
  | 'STATE_MINED'
  | 'STATE_CONFIRMED'
  | 'STATE_INVALID'
  | 'STATE_FAILED';

export type PolymarketRelayerProxyEnvelope =
  | { path: '/submit'; method: 'POST'; body: unknown }
  | { path: '/nonce'; method: 'GET'; query: Record<string, string> }
  | { path: '/transaction'; method: 'GET'; query: Record<string, string> };
