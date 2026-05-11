import type { Hex } from '@metamask/utils';

export type PolymarketWalletCall = {
  target: Hex;
  value: bigint;
  data: Hex;
};

export type PolymarketRelayerSubmitRequest = {
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

export type PolymarketRelayerSubmitResponse = {
  transactionID: string;
  state: string;
};

export type PolymarketRelayerStatusResponse = {
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
