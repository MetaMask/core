import type { Hex } from '@metamask/utils';

export type AcrossToken = {
  address: Hex;
  chainId: number;
  decimals: number;
  name?: string;
  symbol?: string;
};

export type AcrossFeeComponent = {
  amount?: string;
  amountUsd?: string;
  pct?: string | null;
  token?: AcrossToken;
};

export type AcrossFees = {
  total?: AcrossFeeComponent;
  originGas?: AcrossFeeComponent;
  destinationGas?: AcrossFeeComponent;
  relayerCapital?: AcrossFeeComponent;
  relayerTotal?: AcrossFeeComponent;
  lpFee?: AcrossFeeComponent;
  app?: AcrossFeeComponent;
  swapImpact?: AcrossFeeComponent;
};

export type AcrossApprovalTransaction = {
  chainId: number;
  to: Hex;
  data: Hex;
  value?: Hex;
};

export type AcrossSwapTransaction = {
  chainId: number;
  to: Hex;
  data: Hex;
  value?: Hex;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

export type AcrossSwapApprovalResponse = {
  approvalTxns?: AcrossApprovalTransaction[];
  expectedFillTime?: number;
  expectedOutputAmount?: string;
  fees?: AcrossFees;
  id?: string;
  inputAmount?: string;
  inputToken: AcrossToken;
  minOutputAmount?: string;
  outputToken: AcrossToken;
  swapTx: AcrossSwapTransaction;
};

export type AcrossGasLimits = {
  approval: {
    estimate: number;
    max: number;
  }[];
  swap: {
    estimate: number;
    max: number;
  };
};

export type AcrossQuote = {
  gasLimits: AcrossGasLimits;
  quote: AcrossSwapApprovalResponse;
  request: {
    amount: string;
    tradeType: 'exactOutput' | 'exactInput';
  };
};
